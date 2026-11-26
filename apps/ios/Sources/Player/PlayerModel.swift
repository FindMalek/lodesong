import AVFoundation
import Network
import UIKit

/// What every screen uses to control playback. An `AVQueuePlayer` holding the current song and the one after it,
/// so the next song starts without a gap.
@MainActor
final class PlayerModel: ObservableObject {
    @Published private var line = PlayQueue()
    @Published private(set) var isPlaying = false
    @Published private(set) var position: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0
    /// A newer queue saved by another device, waiting for `resumeOffer` or `dismissOffer`.
    @Published var offer: RemoteQueue?

    var queue: [Song] { line.songs }
    var index: Int { line.index }
    var current: Song? { line.current }

    func play(_ songs: [Song], at start: Int = 0) {
        guard songs.indices.contains(start) else { return }
        replace(with: PlayQueue(songs: songs, index: start))
        load(at: 0, play: true)
    }

    func shuffle(_ songs: [Song]) {
        guard !songs.isEmpty else { return }
        replace(with: .shuffling(songs))
        load(at: 0, play: true)
    }

    func playNext(_ song: Song) {
        edit { $0.insertNext(song) }
    }

    func addToQueue(_ song: Song) {
        edit { $0.append(song) }
    }

    func jump(to index: Int) {
        guard line.jump(to: index) else { return }
        load(at: 0, play: true)
    }

    func toggle() {
        isPlaying ? pause() : resume()
    }

    func next() {
        if line.jump(to: index + 1) { load(at: 0, play: isPlaying) } else { finish() }
    }

    /// Back to the start of the song first, as every player does; then to the one before.
    func previous() {
        if position <= 3, line.jump(to: index - 1) { load(at: 0, play: isPlaying) } else { seek(to: 0) }
    }

    func seek(to seconds: TimeInterval) {
        guard current != nil else { return }
        position = max(0, duration > 0 ? min(seconds, duration) : seconds)
        save()
        updateNowPlaying()
        guard let item = loaded?.item else { return }
        seeking += 1
        item.seek(to: Self.time(position), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor in
                self?.seeking -= 1
                self?.updateNowPlaying()
            }
        }
    }

    // MARK: - Hand-off with other devices

    func resumeOffer() {
        guard let offer else { return }
        adopt(offer)
        resume()
    }

    func dismissOffer() {
        defaults.set(offer?.changed, forKey: "queueDismissed")
        offer = nil
    }

    // MARK: - Wiring

    private struct Loaded {
        let item: AVPlayerItem
        let song: Song
        let source: AudioSource
        var status: NSKeyValueObservation?
    }

    private let engine = AVQueuePlayer()
    private var loaded: Loaded?
    private var lined: Loaded?
    private var observers: [NSKeyValueObservation] = []
    private var seeking = 0
    private var failed: [String: [AudioSource]] = [:]
    private var retries = 0
    private var skips = 0
    private var retry: Task<Void, Never>?
    private var stall: Task<Void, Never>?
    private var scrobbled = false
    private var announced = false
    private var lastSave = Date.distantPast
    private var lastPush = Date.distantPast
    private var lastPull = Date.distantPast
    private let network = NWPathMonitor()
    private let store = PlaybackStore(folder: .applicationSupportDirectory)
    private let defaults = UserDefaults.standard
    private lazy var system = SystemAudio(player: self)
    private var app: AppModel?
    private var downloads: DownloadsModel?
    private var account = ""

    private var client: ServerClient? { app?.needsSignIn == false ? app?.client : nil }

    /// This phone's name among the Subsonic clients, so its own saved queue is told apart.
    private lazy var clientID: String = {
        if let id = defaults.string(forKey: "playerClient") { return id }
        let id = "ios-" + UUID().uuidString.prefix(8).lowercased()
        defaults.set(id, forKey: "playerClient")
        return id
    }()

    /// Call once at launch. Brings back the saved queue, paused, without touching the audio session.
    func attach(app: AppModel, downloads: DownloadsModel) {
        guard self.app == nil else { return }
        self.app = app
        self.downloads = downloads
        system.start()
        engine.addPeriodicTimeObserver(forInterval: Self.time(0.5), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.tick(time.seconds) }
        }
        observers = [
            engine.observe(\.currentItem) { [weak self] _, _ in Task { @MainActor in self?.advanced() } },
            engine.observe(\.timeControlStatus) { [weak self] _, _ in Task { @MainActor in self?.watchStall() } },
        ]
        let center = NotificationCenter.default
        center.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] note in
            let item = note.object as? AVPlayerItem
            MainActor.assumeIsolated { self?.ended(item) }
        }
        center.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: nil, queue: .main) { [weak self] note in
            let item = note.object as? AVPlayerItem
            let error = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
            MainActor.assumeIsolated { self?.broke(item, error) }
        }
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.save()
                self?.push()
            }
        }
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.pull() }
        }
        network.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in self?.reconnect() }
        }
        network.start(queue: .global(qos: .utility))
        accountChanged()
    }

    /// Call after signing in or out. Another account never inherits this queue.
    func accountChanged() {
        guard let app else { return }
        guard !app.needsSignIn else { return pause() }
        let now = "\(app.client?.server.absoluteString ?? "") \(app.user)"
        guard now != account else { return pull() }
        account = now
        unload()
        isPlaying = false
        offer = nil
        let saved = store.load(account: account)
        line = saved?.queue ?? PlayQueue()
        position = saved?.position ?? 0
        duration = Double(current?.duration ?? 0)
        if saved == nil { store.clear() }
        updateNowPlaying()
        pull(force: true)
    }

    // MARK: - Playing

    func resume() {
        guard current != nil else { return }
        skips = 0
        retries = 0
        if let loaded, loaded.item.status != .failed {
            isPlaying = true
            system.activate()
            engine.play()
            announce()
            updateNowPlaying()
        } else {
            failed = [:]
            load(at: duration > 0 && position > duration - 1 ? 0 : position, play: true)
        }
    }

    func pause() {
        retry?.cancel()
        stall?.cancel()
        engine.pause()
        guard isPlaying else { return }
        isPlaying = false
        save()
        push()
        updateNowPlaying()
    }

    private func replace(with queue: PlayQueue) {
        line = queue
        failed = [:]
        retries = 0
        skips = 0
        offer = nil
        store.save(queue: line, account: account)
    }

    private func edit(_ change: (inout PlayQueue) -> Void) {
        let wasEmpty = queue.isEmpty
        change(&line)
        store.save(queue: line, account: account)
        if wasEmpty { duration = Double(current?.duration ?? 0) }
        save()
        lineUp()
        updateNowPlaying()
    }

    private func unload() {
        retry?.cancel()
        stall?.cancel()
        loaded = nil
        lined = nil
        engine.removeAllItems()
    }

    private func load(at seconds: TimeInterval, play: Bool) {
        let sameSong = loaded?.song.id == current?.id && position > 0
        unload()
        guard let song = current else { return }
        isPlaying = play
        position = seconds
        duration = Double(song.duration ?? 0)
        if !sameSong || seconds == 0 {
            announced = false
            // Picking a song up past the scrobble point must not count it again.
            scrobbled = seconds > 0 && pastScrobblePoint(seconds)
        }
        guard let made = make(song) else { return skip() }
        loaded = made
        engine.insert(made.item, after: nil)
        if seconds > 0 { made.item.seek(to: Self.time(seconds), toleranceBefore: .zero, toleranceAfter: .zero, completionHandler: nil) }
        engine.volume = volume(for: song)
        if play {
            system.activate()
            engine.play()
            announce()
        } else {
            engine.pause()
        }
        lineUp()
        save()
        updateNowPlaying()
    }

    private func make(_ song: Song) -> Loaded? {
        let file = downloads?.localURL(song: song.id)
        guard let source = AudioSource.pick(suffix: song.suffix, hasFile: file != nil, failed: failed[song.id] ?? []) else { return nil }
        let asset: AVURLAsset
        if source == .file, let file {
            asset = AVURLAsset(url: file, options: AudioSource.mimeType(file: file, suffix: song.suffix).map { [AVURLAssetOverrideMIMETypeKey: $0] })
        } else {
            guard let url = client?.streamURL(song: song.id, source: source) else { return nil }
            // The server only answers a signed-in session, and AVFoundation has to be handed its cookie.
            asset = AVURLAsset(url: url, options: [AVURLAssetHTTPCookiesKey: HTTPCookieStorage.shared.cookies(for: url) ?? []])
        }
        var made = Loaded(item: AVPlayerItem(asset: asset), song: song, source: source)
        made.status = made.item.observe(\.status) { [weak self] item, _ in
            guard item.status != .unknown else { return }
            Task { @MainActor in self?.settled(item) }
        }
        return made
    }

    /// Keeps the engine's second item matching the queue, so it is already buffered when the first ends.
    private func lineUp() {
        guard let loaded else { return }
        let upcoming = line.upcoming
        if let lined, lined.song.id == upcoming?.id, engine.items().contains(lined.item) { return }
        for item in engine.items() where item !== loaded.item { engine.remove(item) }
        lined = upcoming.flatMap(make)
        if let item = lined?.item, engine.canInsert(item, after: loaded.item) { engine.insert(item, after: loaded.item) }
    }

    /// The engine moved to the lined up item by itself.
    private func advanced() {
        guard let next = lined, engine.currentItem === next.item, line.jump(to: index + 1) else { return }
        loaded = next
        lined = nil
        position = 0
        duration = Double(next.song.duration ?? 0)
        announced = false
        scrobbled = false
        engine.volume = volume(for: next.song)
        if isPlaying { announce() }
        if next.item.status == .failed { return broke(next.item, next.item.error) }
        settled(next.item)
        lineUp()
        save()
        updateNowPlaying()
    }

    private func ended(_ item: AVPlayerItem?) {
        guard let item, item === loaded?.item else { return }
        // With a good item lined up the engine moves on and `advanced` takes it from there.
        if let lined, lined.item.status != .failed, engine.items().contains(lined.item) { return }
        if line.jump(to: index + 1) { load(at: 0, play: isPlaying) } else { finish() }
    }

    private func finish() {
        unload()
        isPlaying = false
        position = 0
        save()
        push()
        updateNowPlaying()
    }

    private func settled(_ item: AVPlayerItem) {
        if item.status == .failed { return broke(item, item.error) }
        guard item === loaded?.item, item.status == .readyToPlay else { return }
        let seconds = item.duration.seconds
        // A transcode has no length up front; the library's own number stays then.
        if seconds.isFinite, seconds > 0 { duration = seconds }
        updateNowPlaying()
    }

    /// A network error waits and tries again at the same spot; anything else means iOS can't read these bytes,
    /// so the next source is tried (downloaded file, original, transcode), and then the next song.
    private func broke(_ item: AVPlayerItem?, _ error: Error?) {
        guard let item, let loaded, item === loaded.item else { return }
        if loaded.source != .file, Self.isNetwork(error) { return reload() }
        failed[loaded.song.id, default: []].append(loaded.source)
        load(at: position, play: isPlaying)
    }

    /// Nothing left to try for this song. Three in a row means the trouble is not the songs.
    private func skip() {
        skips += 1
        guard skips < 3, isPlaying, line.jump(to: index + 1) else {
            isPlaying = false
            updateNowPlaying()
            return
        }
        load(at: 0, play: true)
    }

    private func reload() {
        retry?.cancel()
        let wait = [1, 2, 4, 8, 15][min(retries, 4)]
        retries += 1
        retry = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard !Task.isCancelled, let self else { return }
            self.load(at: self.position, play: self.isPlaying)
        }
    }

    /// Wi-Fi to cellular and back: a connection that died with the old network is reopened where it was.
    private func reconnect() {
        guard isPlaying, let loaded, loaded.source != .file else { return }
        guard loaded.item.status == .failed || engine.timeControlStatus != .playing else { return }
        retries = 0
        reload()
    }

    private func watchStall() {
        stall?.cancel()
        guard isPlaying, engine.timeControlStatus == .waitingToPlayAtSpecifiedRate, loaded?.source != .file else { return }
        stall = Task { [weak self] in
            try? await Task.sleep(for: .seconds(12))
            guard !Task.isCancelled, let self, self.isPlaying else { return }
            self.reload()
        }
    }

    private static func isNetwork(_ error: Error?) -> Bool {
        var next = error as NSError?
        while let now = next {
            if now.domain == NSURLErrorDomain { return true }
            next = now.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        return false
    }

    private static func time(_ seconds: TimeInterval) -> CMTime {
        CMTime(seconds: seconds, preferredTimescale: 600)
    }

    private func volume(for song: Song) -> Float {
        // An album played in order keeps its own loud and quiet songs; anything mixed is levelled per song.
        let around = [index - 1, index + 1].filter(queue.indices.contains).map { queue[$0].albumId }
        let album = !line.shuffled && song.albumId != nil && around.contains(song.albumId)
        return song.replayGain?.volume(album: album) ?? 1
    }

    // MARK: - Progress, scrobbling, the saved queue

    private func tick(_ seconds: TimeInterval) {
        guard isPlaying, seeking == 0, seconds.isFinite, let item = loaded?.item, item.status == .readyToPlay,
              engine.currentItem === item, engine.timeControlStatus == .playing else { return }
        position = seconds
        retries = 0
        skips = 0
        if !scrobbled, pastScrobblePoint(seconds), let song = current, let client {
            scrobbled = true
            let id = clientID
            Task { await client.scrobble(song: song.id, submission: true, client: id) }
        }
        if -lastSave.timeIntervalSinceNow > 5 { save() }
        if -lastPush.timeIntervalSinceNow > 15 { push() }
    }

    private func pastScrobblePoint(_ seconds: TimeInterval) -> Bool {
        seconds >= 240 || (duration > 0 && seconds >= duration / 2)
    }

    /// "Now playing" and the new queue go to the server the first time a song actually plays.
    private func announce() {
        guard !announced, let song = current, let client else { return }
        announced = true
        let id = clientID
        Task { await client.scrobble(song: song.id, submission: false, client: id) }
        push()
    }

    private func save() {
        guard current != nil else { return }
        lastSave = Date()
        store.save(index: index, position: position)
    }

    private func push() {
        guard let client, current != nil, defaults.object(forKey: "queueSync") as? Bool ?? true else { return }
        lastPush = Date()
        let ids = queue[index...].prefix(1000).map(\.id)
        let position = position
        let id = clientID
        // The extra time lets the save finish when the app is leaving the screen.
        let background = UIApplication.shared.beginBackgroundTask()
        Task {
            if await client.savePlayQueue(ids, position: position, client: id) { defaults.set(Date().timeIntervalSince1970, forKey: "queueSaved") }
            UIApplication.shared.endBackgroundTask(background)
        }
    }

    /// Another device's newer queue is only offered, never taken over: unless there is nothing here at all.
    private func pull(force: Bool = false) {
        guard let client, defaults.object(forKey: "queueSync") as? Bool ?? true, force || -lastPull.timeIntervalSinceNow > 30 else { return }
        lastPull = Date()
        let id = clientID
        Task {
            guard let remote = await client.savedPlayQueue(client: id), remote.changedBy != "lodesong@\(id)",
                  remote.changed != defaults.string(forKey: "queueDismissed") else { return }
            if queue.isEmpty { return adopt(remote) }
            guard (remote.date?.timeIntervalSince1970 ?? 0) > defaults.double(forKey: "queueSaved") else { return }
            let song = remote.songs[remote.index]
            if current?.id == song.id, abs(position - remote.position) < 10 { return }
            offer = remote
        }
    }

    private func adopt(_ remote: RemoteQueue) {
        pause()
        unload()
        replace(with: PlayQueue(songs: remote.songs, index: remote.index))
        position = remote.position
        duration = Double(current?.duration ?? 0)
        save()
        updateNowPlaying()
    }

    private func updateNowPlaying() {
        guard app != nil else { return }
        system.show(current, index: index, count: queue.count, position: position, duration: duration, playing: isPlaying, client: client)
    }
}
