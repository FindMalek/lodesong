import AVFoundation
import Network
import UIKit

/// Where the current song is. Its own object, so only the views that draw progress redraw twice a second.
@MainActor
final class PlayerClock: ObservableObject {
    @Published fileprivate(set) var position: TimeInterval = 0
}

/// What every screen uses to control playback. An `AVQueuePlayer` holding the current song and the one after it,
/// so the next song starts without a gap.
@MainActor
final class PlayerModel: ObservableObject {
    @Published private var line = PlayQueue()
    @Published private(set) var isPlaying = false
    let clock = PlayerClock()
    private(set) var position: TimeInterval {
        get { clock.position }
        set { clock.position = newValue }
    }
    @Published private(set) var repeatMode = RepeatMode(rawValue: UserDefaults.standard.string(forKey: "repeatMode") ?? "") ?? .off
    @Published private(set) var duration: TimeInterval = 0
    /// A newer queue saved by another device, waiting for `resumeOffer` or `dismissOffer`.
    @Published var offer: RemoteQueue?

    var queue: [Song] { line.songs }
    var index: Int { line.index }
    var current: Song? { line.current }
    var isShuffled: Bool { line.shuffled }

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
        playNext([song])
    }

    func addToQueue(_ song: Song) {
        addToQueue([song])
    }

    /// Keeps the order given, and writes the queue once however many there are.
    func playNext(_ songs: [Song]) {
        guard !songs.isEmpty else { return }
        edit { $0.insertNext(songs) }
    }

    func addToQueue(_ songs: [Song]) {
        guard !songs.isEmpty else { return }
        edit { $0.append(songs) }
    }

    func move(from source: IndexSet, to target: Int) {
        edit { $0.move(from: source, to: target) }
    }

    func remove(at offsets: IndexSet) {
        var changed = line
        guard changed.remove(at: offsets) else { return edit { $0 = changed } }
        // The current song went. Carry on with what followed it, if anything is left to follow.
        let play = isPlaying && queue.indices.contains { $0 > index && !offsets.contains($0) }
        line = changed
        store.save(queue: line, account: account)
        guard current != nil else {
            finishPlay()
            unload()
            isPlaying = false
            position = 0
            duration = 0
            store.clear()
            return updateNowPlaying()
        }
        load(at: 0, play: play)
    }

    func toggleShuffle() {
        edit { $0.setShuffled(!$0.shuffled) }
    }

    /// Off, the whole queue, then the one song.
    func cycleRepeat() {
        let modes = RepeatMode.allCases
        repeatMode = modes[(modes.firstIndex(of: repeatMode)! + 1) % modes.count]
        defaults.set(repeatMode.rawValue, forKey: "repeatMode")
        lineUp()
    }

    func jump(to index: Int) {
        guard line.jump(to: index) else { return }
        load(at: 0, play: true)
    }

    func toggle() {
        isPlaying ? pause() : resume()
    }

    func next() {
        if line.jump(to: index + 1) || (repeatMode == .all && line.jump(to: 0)) { load(at: 0, play: isPlaying) } else { finish() }
    }

    /// Back to the start of the song first, as every player does; then to the one before.
    func previous() {
        if position <= 3, line.jump(to: index - 1) { load(at: 0, play: isPlaying) } else { seek(to: 0) }
    }

    func seek(to seconds: TimeInterval) {
        guard current != nil else { return }
        position = max(0, duration > 0 ? min(seconds, duration) : seconds)
        log.jumped(to: position)
        save()
        updateNowPlaying()
        publish(force: true)
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
    private let log = PlayLog(folder: .applicationSupportDirectory)
    private var lastSend = Date.distantPast
    private var link: DeviceLink?
    /// This phone holds the shared session (docs/devices.md).
    private var holdsSession = false
    private var published = ""
    private var lastPublish = Date.distantPast
    private let defaults = UserDefaults.standard
    private lazy var system = SystemAudio(player: self)
    private var app: AppModel?
    private var downloads: DownloadsModel?
    private var account = ""
    private var synced: QueueMark?

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
                self?.sendPlays()
            }
        }
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.pull()
                self?.sendPlays()
                if self?.link?.isConnected == false { self?.link?.connect() }
            }
        }
        network.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in
                self?.reconnect()
                self?.sendPlays()
            }
        }
        network.start(queue: .global(qos: .utility))
        accountChanged()
    }

    /// Call after signing in or out. Another account never inherits this queue.
    func accountChanged() {
        guard let app else { return }
        guard !app.needsSignIn else {
            pause()
            log.end()
            link?.close()
            link = nil
            account = ""
            unload()
            return system.show(nil, index: 0, count: 0, position: 0, duration: 0, playing: false, client: nil)
        }
        let now = "\(app.client?.server.absoluteString ?? "") \(app.user)"
        guard now != account else { return pull() }
        log.end()
        account = now
        unload()
        isPlaying = false
        offer = nil
        let saved = store.load(account: account)
        line = saved?.queue ?? PlayQueue()
        position = saved?.position ?? 0
        duration = Double(current?.duration ?? 0)
        synced = QueueMark(line, position: position)
        if saved == nil { store.clear() }
        updateNowPlaying()
        pull(force: true)
        sendPlays()
        join()
    }

    // MARK: - Playing

    func resume() {
        guard current != nil, app?.needsSignIn == false else { return }
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
            let over = duration > 0 && position > duration - 1
            // An item that failed and is opened again is still the same play.
            load(at: over ? 0 : position, play: true, again: loaded != nil && !over)
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

    /// `again` reopens the song that is already on, so it is not announced or scrobbled twice.
    private func load(at seconds: TimeInterval, play: Bool, again: Bool = false) {
        if !again { finishPlay() }
        unload()
        guard let song = current else { return }
        isPlaying = play
        position = seconds
        duration = Double(song.duration ?? 0)
        if !again {
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
        let upcoming = line.following(repeatMode).map { line.songs[$0] }
        if let lined, lined.song.id == upcoming?.id, engine.items().contains(lined.item) { return }
        for item in engine.items() where item !== loaded.item { engine.remove(item) }
        lined = upcoming.flatMap(make)
        if let item = lined?.item, engine.canInsert(item, after: loaded.item) { engine.insert(item, after: loaded.item) }
    }

    /// The engine moved to the lined up item by itself.
    private func advanced() {
        guard let next = lined, engine.currentItem === next.item, let target = line.following(repeatMode), line.jump(to: target) else { return }
        finishPlay()
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
        if let target = line.following(repeatMode), line.jump(to: target) { load(at: 0, play: isPlaying) } else { finish() }
    }

    private func finish() {
        finishPlay()
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
        // The lined up song can fail early: line up its next source now, so the change of song stays seamless.
        if let lined, item === lined.item, !Self.isNetwork(error) {
            failed[lined.song.id, default: []].append(lined.source)
            self.lined = nil
            return lineUp()
        }
        guard let item, let loaded, item === loaded.item else { return }
        // Paused: leave it, pressing play opens it again.
        if loaded.source != .file, Self.isNetwork(error) { return isPlaying ? reload() : () }
        failed[loaded.song.id, default: []].append(loaded.source)
        load(at: position, play: isPlaying, again: true)
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
            self.load(at: self.position, play: self.isPlaying, again: true)
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
        if let song = loaded?.song { log.hear(song, account: account, position: seconds, duration: duration) }
        if !scrobbled, pastScrobblePoint(seconds) {
            scrobbled = true
            log.count()
            sendPlays()
        }
        if -lastSend.timeIntervalSinceNow > 60 { sendPlays() }
        if -lastPublish.timeIntervalSinceNow > 5 { publish(force: true) }
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

    private func finishPlay() {
        log.end()
        sendPlays()
    }

    private func sendPlays() {
        guard let client, !account.isEmpty else { return }
        lastSend = Date()
        let id = clientID
        let account = account
        keepAwake { [log] in
            await log.flush(client, account: account, client: id) { account == self.account && self.client != nil }
        }
    }

    /// Lets a request finish when the app is leaving the screen. The time has to be handed back when iOS asks,
    /// or iOS kills the app.
    private func keepAwake(_ run: @escaping @MainActor () async -> Void) {
        var background = UIBackgroundTaskIdentifier.invalid
        var work: Task<Void, Never>?
        let end = {
            guard background != .invalid else { return }
            UIApplication.shared.endBackgroundTask(background)
            background = .invalid
        }
        background = UIApplication.shared.beginBackgroundTask {
            work?.cancel()
            end()
        }
        work = Task { @MainActor in
            await run()
            end()
        }
    }

    private func save() {
        log.save()
        guard current != nil else { return }
        lastSave = Date()
        store.save(index: index, position: position)
    }

    private func push() {
        guard let client, current != nil, defaults.object(forKey: "queueSync") as? Bool ?? true else { return }
        let mark = QueueMark(line, position: position)
        guard mark != synced else { return }
        lastPush = Date()
        let id = clientID
        let account = account
        keepAwake {
            if await client.savePlayQueue(mark, client: id), account == self.account {
                self.synced = mark
                self.defaults.set(Date().timeIntervalSince1970, forKey: "queueSaved")
            }
        }
    }

    /// Another device's newer queue is only offered, never taken over: unless there is nothing here at all.
    private func pull(force: Bool = false) {
        guard let client, defaults.object(forKey: "queueSync") as? Bool ?? true, force || -lastPull.timeIntervalSinceNow > 30 else { return }
        lastPull = Date()
        let id = clientID
        let account = account
        Task {
            guard let remote = await client.savedPlayQueue(client: id), account == self.account, self.client != nil,
                  remote.changedBy != "lodesong@\(id)",
                  remote.changed != defaults.string(forKey: "queueDismissed") else { return }
            if queue.isEmpty { return adopt(remote) }
            guard (remote.date?.timeIntervalSince1970 ?? 0) > defaults.double(forKey: "queueSaved") else { return }
            let song = remote.songs[remote.index]
            if current?.id == song.id, abs(position - remote.position) < 10 { return }
            offer = remote
            // Theirs is newer: whatever never reached the server from here must not replace it on the way out.
            if !isPlaying { synced = QueueMark(line, position: self.position) }
        }
    }

    private func adopt(_ remote: RemoteQueue) {
        pause()
        finishPlay()
        unload()
        replace(with: PlayQueue(songs: remote.songs, index: remote.index))
        position = remote.position
        duration = Double(current?.duration ?? 0)
        synced = QueueMark(line, position: position)
        save()
        updateNowPlaying()
    }

    // MARK: - The session across devices

    private func join() {
        link?.close()
        link = nil
        holdsSession = false
        guard let client else { return }
        let id = clientID
        let name = UIDevice.current.userInterfaceIdiom == .pad ? "the ipad app" : "the iphone app"
        link = DeviceLink(
            request: { client.devicesRequest(id: id, name: name, cookies: HTTPCookieStorage.shared.cookies(for: client.server) ?? []) },
            opened: { [weak self] in
                // The server forgot this socket's past; a song already on takes the session again.
                if self?.isPlaying == true { self?.publish(force: true) }
            },
            received: { [weak self] in self?.receive($0) })
    }

    /// Playing takes the session. Paused, only the device that holds it has anything to say.
    private func publish(force: Bool = false) {
        guard let link, current != nil, isPlaying || holdsSession else { return }
        let songs = Array(queue.dropFirst(index).prefix(DeviceState.maxSongs))
        let key = "\(songs.map(\.id).joined(separator: ","))|\(isPlaying)"
        guard force || key != published else { return }
        published = key
        lastPublish = Date()
        link.send(DeviceState(songs: songs, position: position, playing: isPlaying))
    }

    private func receive(_ message: DeviceMessage) {
        switch message {
        case .active(let id): holdsSession = id == clientID
        case .yield:
            holdsSession = false
            pause()
        case .take(let state):
            holdsSession = true
            if queue.dropFirst(index).prefix(DeviceState.maxSongs).map(\.id) == state.songs.map(\.id) {
                seek(to: state.position)
            } else {
                adopt(RemoteQueue(songs: state.songs, index: 0, position: state.position, changed: "", changedBy: ""))
            }
            if state.playing { resume() }
        case .command(let command):
            switch command {
            case .toggle(let playing): playing ? resume() : pause()
            case .next: next()
            case .previous: previous()
            case .seek(let seconds): seek(to: seconds)
            case .play(let songs, let start, let shuffle):
                play(songs, at: start)
                if shuffle { toggleShuffle() }
            case .add(let songs, let next): next ? playNext(songs) : addToQueue(songs)
            }
        }
    }

    private func updateNowPlaying() {
        guard app != nil else { return }
        publish()
        system.show(current, index: index, count: queue.count, position: position, duration: duration, playing: isPlaying, client: client)
    }
}
