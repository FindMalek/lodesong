import AVFoundation
import Network
import UIKit

/// Where the current song is. Its own object, so only the views that draw progress redraw twice a second.
@MainActor
final class PlayerClock: ObservableObject {
    @Published fileprivate(set) var position: TimeInterval = 0
}

/// When playback should stop by itself.
enum SleepTimer: Equatable {
    case at(Date)
    case endOfSong
}

/// What every screen uses to control playback. An `AVQueuePlayer` holding the current song and the one after it,
/// so the next song starts without a gap.
@MainActor
final class PlayerModel: ObservableObject {
    @Published private var line = PlayQueue()
    @Published private(set) var isPlaying = false
    /// What the screens follow: this phone's position, or the playing device's while it is a remote.
    var clock: PlayerClock { isRemote ? remoteClock : ownClock }
    private let ownClock = PlayerClock()
    private let remoteClock = PlayerClock()
    private(set) var position: TimeInterval {
        get { ownClock.position }
        set { ownClock.position = newValue }
    }
    /// The devices of the account, and what plays when it isn't this phone (docs/devices.md).
    @Published private(set) var mirror = DeviceMirror()
    var isRemote: Bool { mirror.playingOn != nil }
    /// This phone's id in `mirror.devices`.
    var deviceID: String { clientID }
    @Published private(set) var repeatMode = RepeatMode(rawValue: UserDefaults.standard.string(forKey: "repeatMode") ?? "") ?? .off
    @Published private(set) var duration: TimeInterval = 0
    /// A newer queue saved by another device, waiting for `resumeOffer` or `dismissOffer`.
    @Published var offer: RemoteQueue?
    /// Format and bit rate of what is loaded.
    @Published private(set) var streamDetail: String?
    @Published private(set) var sleepTimer: SleepTimer?
    /// Moves whenever a like or a rating, or whether it reached the server, may have changed.
    @Published private var marksRevision = 0

    var queue: [Song] { line.songs }
    var index: Int { line.index }
    var current: Song? { line.current }
    var isShuffled: Bool { line.shuffled }

    func play(_ songs: [Song], at start: Int = 0) {
        if isRemote {
            guard songs.indices.contains(start) else { return }
            return command(.play(songs, start: start, shuffle: false))
        }
        var (songs, start) = (songs, start)
        if app?.offlineMode == true { (songs, start) = PlayQueue.available(songs, start: start) { localFile($0) != nil } }
        guard songs.indices.contains(start) else { return }
        var next = PlayQueue(songs: songs, index: start)
        if line.shuffled, defaults.bool(Pref.keepShuffle, or: false) { next.setShuffled(true) }
        replace(with: next)
        load(at: 0, play: true)
    }

    func shuffle(_ songs: [Song]) {
        if isRemote {
            guard !songs.isEmpty else { return }
            return command(.play(songs, start: .random(in: songs.indices), shuffle: true))
        }
        let songs = app?.offlineMode == true ? songs.filter { localFile($0.id) != nil } : songs
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
        if isRemote { return command(.add(songs, next: true)) }
        edit { $0.insertNext(songs) }
    }

    func addToQueue(_ songs: [Song]) {
        guard !songs.isEmpty else { return }
        if isRemote { return command(.add(songs, next: false)) }
        edit { $0.append(songs) }
    }

    // Nothing in the protocol reorders, removes, shuffles or repeats on another device, so a remote leaves them be.

    func move(from source: IndexSet, to target: Int) {
        guard !isRemote else { return }
        edit { $0.move(from: source, to: target) }
    }

    func remove(at offsets: IndexSet) {
        guard !isRemote else { return }
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
        guard !isRemote else { return }
        edit { $0.setShuffled(!$0.shuffled) }
    }

    /// Off, the whole queue, then the one song.
    func cycleRepeat() {
        guard !isRemote else { return }
        let modes = RepeatMode.allCases
        repeatMode = modes[(modes.firstIndex(of: repeatMode)! + 1) % modes.count]
        defaults.set(repeatMode.rawValue, forKey: "repeatMode")
        lineUp()
    }

    func jump(to index: Int) {
        if isRemote {
            let songs = mirror.state?.songs ?? []
            guard songs.indices.contains(index) else { return }
            return command(.play(songs, start: index, shuffle: false))
        }
        guard line.jump(to: index) else { return }
        // A timer that ran out while paused must not stop what is picked next.
        if sleepIsDue { setSleepTimer(nil) }
        load(at: 0, play: true)
    }

    func toggle() {
        if isRemote { return command(.toggle(playing: mirror.state?.playing != true)) }
        isPlaying ? pause() : resume()
    }

    /// Whether playing `songs` would drop what is still to come.
    func wouldReplace(_ songs: [Song]) -> Bool {
        isRemote ? PlayQueue(songs: mirror.state?.songs ?? []).wouldLose(songs) : line.wouldLose(songs)
    }

    /// A downloaded file, or one cached ahead.
    func localFile(_ id: String) -> URL? {
        downloads?.localURL(song: id) ?? songCache?.file(id)
    }

    func next() {
        if isRemote { return command(.next) }
        if line.jump(to: index + 1) || (repeatMode == .all && line.jump(to: 0)) { load(at: 0, play: isPlaying) } else { finish() }
    }

    /// Back to the start of the song first, as every player does; then to the one before.
    func previous() {
        if isRemote { return command(.previous) }
        var before = index - 1
        if app?.offlineMode == true { before = queue.prefix(index).lastIndex { localFile($0.id) != nil } ?? -1 }
        if position <= 3, line.jump(to: before) { load(at: 0, play: isPlaying) } else { seek(to: 0) }
    }

    func seek(to seconds: TimeInterval) {
        if isRemote { return command(.seek(to: max(0, seconds))) }
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

    // MARK: - Likes and ratings

    func isLiked(_ song: Song) -> Bool { marks.liked(fresh(song), account: account) }
    func rating(_ song: Song) -> Int { marks.rating(fresh(song), account: account) }

    /// Changed here and not on the server yet, because it can't be reached.
    func isUnsent(_ song: Song) -> Bool {
        marks.waiting(song: song.id, account: account, offline: app?.offlineMode == true)
    }

    func setLiked(_ song: Song, _ liked: Bool) { mark(song, .like, liked ? 1 : 0) }
    func rate(_ song: Song, _ stars: Int) { mark(song, .rating, stars) }

    private func mark(_ song: Song, _ kind: MarkChange.Kind, _ value: Int) {
        guard !account.isEmpty else { return }
        marks.set(kind, value, song: song.id, account: account)
        marksRevision += 1
        sendMarks()
    }

    /// The library's copy is newer than the one the queue was made with.
    private func fresh(_ song: Song) -> Song { app?.library.songs.first { $0.id == song.id } ?? song }

    /// The library came in again: what it already says no longer has to be remembered here.
    func librarySynced() {
        guard let app else { return }
        marks.settle(account: account, sentBefore: app.syncStarted)
        marksRevision += 1
    }

    private func sendMarks() {
        guard let client, marks.hasUnsent(account: account) else { return }
        let id = clientID
        let account = account
        keepAwake { [marks] in
            await marks.flush(client, account: account, client: id) { account == self.account && self.client != nil }
            self.marksRevision += 1
        }
    }

    // MARK: - Sleep timer

    func setSleepTimer(_ timer: SleepTimer?) {
        sleepTimer = timer
        // The engine would otherwise start the lined up song by itself.
        engine.actionAtItemEnd = timer == .endOfSong ? .pause : .advance
    }

    /// The end of a call is not someone pressing play: a timer that ran out during it still holds.
    func resumeAfterInterruption() {
        if sleepIsDue { return setSleepTimer(nil) }
        resume()
    }

    private var sleepIsDue: Bool {
        if case .at(let time) = sleepTimer { return Date() >= time }
        return false
    }

    // MARK: - Hand-off with other devices

    func resumeOffer() {
        guard let offer else { return }
        adopt(offer)
        resume()
    }

    func dismissOffer() {
        // A session left by a device that went away has no saved queue to remember as dismissed.
        if let changed = offer?.changed, !changed.isEmpty { defaults.set(changed, forKey: "queueDismissed") }
        offer = nil
    }

    // MARK: - Wiring

    private struct Loaded {
        let item: AVPlayerItem
        let song: Song
        let source: AudioSource
        /// What it was made for; a lined up item made for something else is made again.
        let key: String
        let detail: String
        var status: NSKeyValueObservation?
    }

    private let engine = AVQueuePlayer()
    private var loaded: Loaded? {
        didSet { streamDetail = loaded?.detail }
    }
    private var lined: Loaded?
    private var observers: [NSKeyValueObservation] = []
    private var seeking = 0
    private var failed: [String: [AudioSource]] = [:]
    private var retries = 0
    private var skips = 0
    private var retry: Task<Void, Never>?
    private var stall: Task<Void, Never>?
    private var scrobbled = false
    private var reporting = true
    private var announced = false
    private var lastSave = Date.distantPast
    private var lastPush = Date.distantPast
    private var lastPull = Date.distantPast
    private let network = NWPathMonitor()
    private let store = PlaybackStore(folder: .applicationSupportDirectory)
    private let log = PlayLog(folder: .applicationSupportDirectory)
    private let marks = SongMarks(folder: .applicationSupportDirectory)
    private var lastSend = Date.distantPast
    private var link: DeviceLink?
    /// This phone holds the shared session (docs/devices.md).
    private var holdsSession = false
    /// Another device took the session and the list naming it is still to come.
    private var awaitingDevices = false
    private var published = ""
    private var remoteTick: Task<Void, Never>?
    private var volumeSend: Task<Void, Never>?
    private var lastPublish = Date.distantPast
    private let defaults = UserDefaults.standard
    private lazy var system = SystemAudio(player: self)
    private var app: AppModel?
    private var downloads: DownloadsModel?
    private var account = ""
    private var synced: QueueMark?

    private var client: ServerClient? { app?.live }
    private var cached: SongCache?
    private var filling: Task<Void, Never>?
    private var fillKey = ""

    /// Songs fetched ahead for this account.
    private var songCache: SongCache? {
        guard let app, let server = app.client?.identity else { return nil }
        let folder = URL.cachesDirectory.appending(path: "ahead/\(DownloadLibrary.folder(server: server, user: app.user))")
        if cached?.folder != folder { cached = SongCache(folder: folder) }
        return cached
    }

    /// In kbit/s for the network now in use, zero for the file as it is.
    private var bitRateLimit: Int {
        defaults.int(network.currentPath.isExpensive ? Pref.cellularBitRate : Pref.wifiBitRate, or: 0)
    }

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
        applySettings()
        NotificationCenter.default.addObserver(forName: UserDefaults.didChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.applySettings() }
        }
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
                self?.updateNowPlaying()
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
                await self?.app?.chooseAddress()
                self?.refreshAhead()
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
            filling?.cancel()
            fillKey = ""
            pause()
            setSleepTimer(nil)
            log.end()
            leaveSession()
            account = ""
            unload()
            return system.show(nil, index: 0, count: 0, position: 0, duration: 0, playing: false, speed: 1, client: nil)
        }
        let now = "\(app.client?.identity.absoluteString ?? "") \(app.user)"
        guard now != account else { return pull() }
        // Before the queue changes: nothing of the last account's session may reach this one.
        leaveSession()
        log.end()
        account = now
        setSleepTimer(nil)
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

    /// Also what the system calls (a call ending, a car connecting), so it never reaches another device.
    func resume() {
        guard !isRemote, current != nil, app?.needsSignIn == false else { return }
        skips = 0
        retries = 0
        // It ran out while paused: pressing play means carry on.
        if sleepIsDue { setSleepTimer(nil) }
        if let loaded, loaded.item.status != .failed {
            isPlaying = true
            system.activate()
            engine.play()
            announce()
            updateNowPlaying()
            cacheAhead()
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
        if sleepIsDue { setSleepTimer(nil) }
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

    /// The app moved to the server's other address.
    func serverChanged() {
        guard app?.needsSignIn == false else { return }
        join()
        refreshAhead()
        reconnect()
    }

    /// Offline mode went on or off.
    func connectionChanged() {
        guard let app, !app.needsSignIn else { return }
        join()
        if app.offlineMode {
            filling?.cancel()
            fillKey = ""
            // What streams now must stop; the same song carries on from the phone if it is there.
            if let loaded, loaded.source != .file {
                if localFile(loaded.song.id) != nil {
                    failed[loaded.song.id] = nil
                    load(at: position, play: isPlaying, again: true)
                } else {
                    pause()
                    unload()
                }
            }
        } else {
            pull(force: true)
            sendPlays()
        }
        refreshAhead()
        updateNowPlaying()
    }

    /// The next song and the ones cached ahead follow what is asked for now: quality, network, address.
    private func refreshAhead() {
        guard loaded != nil else { return }
        let upcoming = line.following(repeatMode).map { line.songs[$0] }
        if upcoming.map({ key($0) }) != lined?.key { lineUp() } else { cacheAhead() }
    }

    private func key(_ song: Song) -> String {
        "\(song.id) \(bitRateLimit) \(client?.server.absoluteString ?? "") \(localFile(song.id)?.lastPathComponent ?? "")"
    }

    private func cacheAhead() {
        guard let cache = songCache else { return }
        let count = defaults.int(Pref.cacheAhead, or: 0)
        let limit = bitRateLimit
        let ahead = Array(queue.dropFirst(index + 1).prefix(count)).filter { downloads?.localURL(song: $0.id) == nil }
        let wanted = "\(count) \(limit) \(client?.server.absoluteString ?? "") \(current?.id ?? "") \(ahead.map(\.id))"
        guard wanted != fillKey else { return }
        fillKey = wanted
        filling?.cancel()
        cache.prune(keeping: count > 0 ? ahead.map(\.id) + [current?.id].compactMap { $0 } : [])
        guard isPlaying, let client, !ahead.isEmpty else {
            // Nothing is fetched while paused; ask again once it plays.
            if !isPlaying { fillKey = "" }
            return
        }
        let before = filling
        filling = Task { [weak self] in
            await before?.value
            await cache.fill(ahead, limit: limit, client: client) { [weak self] in
                await MainActor.run { self?.refreshAhead() }
            }
        }
    }

    /// Settings that act on what is already playing.
    private func applySettings() {
        system.skipSeconds(defaults.int(Pref.lockSkipSeconds, or: 0))
        let stored = defaults.float(forKey: Pref.speed)
        let speed = stored > 0 ? stored : 1
        if engine.defaultRate != speed {
            engine.defaultRate = speed
            if isPlaying { engine.rate = speed }
            updateNowPlaying()
        }
        if let song = loaded?.song { engine.volume = volume(for: song) }
        refreshAhead()
        // Whatever is heard while reporting is off must not be added to the play when it comes back on.
        if reporting != reportsPlayback {
            reporting = reportsPlayback
            if !reporting { log.end() }
        }
    }

    func skip(by seconds: TimeInterval) {
        seek(to: clock.position + seconds)
    }

    private func make(_ song: Song) -> Loaded? {
        let file = localFile(song.id)
        let limit = bitRateLimit
        guard let source = AudioSource.pick(suffix: song.suffix, hasFile: file != nil, limited: limit > 0, failed: failed[song.id] ?? []) else { return nil }
        let asset: AVURLAsset
        if source == .file, let file {
            asset = AVURLAsset(url: file, options: AudioSource.mimeType(file: file, suffix: song.suffix).map { [AVURLAssetOverrideMIMETypeKey: $0] })
        } else {
            guard let url = client?.streamURL(song: song.id, source: source, bitRate: limit > 0 ? limit : 320) else { return nil }
            // The server only answers a signed-in session, and AVFoundation has to be handed its cookie.
            asset = AVURLAsset(url: url, options: [AVURLAssetHTTPCookiesKey: HTTPCookieStorage.shared.cookies(for: url) ?? []])
        }
        let fileBytes = source == .file ? (try? file?.resourceValues(forKeys: [.fileSizeKey]))?.fileSize : nil
        let detail = StreamLine.text(song, source: source, limit: limit > 0 ? limit : 320, fileType: file?.pathExtension, fileBytes: fileBytes)
        var made = Loaded(item: AVPlayerItem(asset: asset), song: song, source: source, key: key(song), detail: detail)
        made.status = made.item.observe(\.status) { [weak self] item, _ in
            guard item.status != .unknown else { return }
            Task { @MainActor in self?.settled(item) }
        }
        return made
    }

    /// Keeps the engine's second item matching the queue, so it is already buffered when the first ends.
    private func lineUp() {
        guard let loaded else { return }
        defer { cacheAhead() }
        let upcoming = line.following(repeatMode).map { line.songs[$0] }
        if let lined, let upcoming, lined.key == key(upcoming), engine.items().contains(lined.item) { return }
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
        if sleepTimer == .endOfSong {
            setSleepTimer(nil)
            guard let target = line.following(repeatMode), line.jump(to: target) else { return finish() }
            load(at: 0, play: false)
            return push()
        }
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
        AppLog.shared.add("Playback failed (\(loaded.source)): \(error?.localizedDescription ?? "unknown error")")
        // Paused: leave it, pressing play opens it again.
        if loaded.source != .file, Self.isNetwork(error) { return isPlaying ? reload() : () }
        failed[loaded.song.id, default: []].append(loaded.source)
        load(at: position, play: isPlaying, again: true)
    }

    /// Nothing left to try for this song. Three in a row means the trouble is not the songs.
    private func skip() {
        skips += 1
        // Offline, a song that isn't on the phone says nothing about the next one: go straight to one that is.
        var target = index + 1
        if app?.offlineMode == true {
            target = queue.indices.first { $0 > index && localFile(queue[$0].id) != nil } ?? queue.count
            skips = 0
        }
        guard skips < 3, isPlaying, line.jump(to: target) else {
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
        let mode = defaults.string(forKey: Pref.replayGain) ?? "auto"
        if mode != "auto" { return mode == "off" ? 1 : song.replayGain?.volume(album: mode == "album") ?? 1 }
        // An album played in order keeps its own loud and quiet songs; anything mixed is levelled per song.
        let around = [index - 1, index + 1].filter(queue.indices.contains).map { queue[$0].albumId }
        let album = !line.shuffled && song.albumId != nil && around.contains(song.albumId)
        return song.replayGain?.volume(album: album) ?? 1
    }

    // MARK: - Progress, scrobbling, the saved queue

    private func tick(_ seconds: TimeInterval) {
        if isPlaying, sleepIsDue {
            setSleepTimer(nil)
            return pause()
        }
        guard isPlaying, seeking == 0, seconds.isFinite, let item = loaded?.item, item.status == .readyToPlay,
              engine.currentItem === item, engine.timeControlStatus == .playing else { return }
        position = seconds
        retries = 0
        skips = 0
        if reportsPlayback, let song = loaded?.song { log.hear(song, account: account, position: seconds, duration: duration) }
        if reportsPlayback, !scrobbled, pastScrobblePoint(seconds) {
            scrobbled = true
            log.count()
            sendPlays()
        }
        if -lastSend.timeIntervalSinceNow > 60 { sendPlays() }
        if -lastPublish.timeIntervalSinceNow > 5 { publish(force: true) }
        if -lastSave.timeIntervalSinceNow > 5 { save() }
        if -lastPush.timeIntervalSinceNow > 15 { push() }
    }

    private var reportsPlayback: Bool { defaults.bool(Pref.reportPlayback, or: true) }

    private func pastScrobblePoint(_ seconds: TimeInterval) -> Bool {
        Pref.pastScrobblePoint(seconds, duration: duration,
                               percent: defaults.int(Pref.scrobblePercent, or: 50), minutes: defaults.int(Pref.scrobbleMinutes, or: 4))
    }

    /// "Now playing" and the new queue go to the server the first time a song actually plays.
    private func announce() {
        guard !announced, let song = current, let client else { return }
        announced = true
        let id = clientID
        if reportsPlayback { Task { await client.scrobble(song: song.id, submission: false, client: id) } }
        push()
    }

    private func finishPlay() {
        log.end()
        sendPlays()
    }

    private func sendPlays() {
        sendMarks()
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
        guard !isRemote, let client, current != nil, defaults.bool(Pref.queueSync, or: true) else { return }
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
        guard let client, defaults.bool(Pref.queueSync, or: true), force || -lastPull.timeIntervalSinceNow > 30 else { return }
        lastPull = Date()
        let id = clientID
        let account = account
        Task {
            guard let remote = await client.savedPlayQueue(client: id), account == self.account, self.client != nil, !isRemote,
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

    /// Moves playback to a device of the list, this phone included.
    func transfer(to device: String) {
        guard let link else { return }
        guard device != clientID, !isRemote, current != nil else { return link.send(.transfer(to: device)) }
        // So the other device picks up from here, not from the last heartbeat or another session's leftovers.
        let state = sessionState()
        DeviceRequest.handOver(state, to: device, claim: !holdsSession && !isPlaying).forEach(link.send)
        // Shown until the device that takes over says something itself.
        mirror.heard(state)
    }

    private func sessionState() -> DeviceState {
        DeviceState(songs: Array(queue.dropFirst(index).prefix(DeviceState.maxSongs)), position: position, playing: isPlaying)
    }

    /// The playing device's volume, at most ten times a second while the slider moves.
    func setRemoteVolume(_ level: Double) {
        guard isRemote else { return }
        mirror.expect(.volume(level))
        guard volumeSend == nil else { return }
        link?.send(.command(.volume(level)))
        volumeSend = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(100))
            guard !Task.isCancelled, let self else { return }
            self.volumeSend = nil
            if let latest = self.mirror.state?.volume, latest != level { self.setRemoteVolume(latest) }
        }
    }

    private func command(_ command: DeviceCommand) {
        link?.send(.command(command))
        mirror.expect(command)
        showRemote()
    }

    private func join() {
        link?.close()
        link = nil
        // In the background a remote stays one across a change of address, or the lock screen would play from here.
        if client == nil || UIApplication.shared.applicationState != .background { forgetSession() }
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

    private func leaveSession() {
        link?.close()
        link = nil
        forgetSession()
    }

    private func forgetSession() {
        holdsSession = false
        awaitingDevices = false
        mirror = DeviceMirror()
        volumeSend?.cancel()
        volumeSend = nil
        showRemote()
    }

    private func showRemote() {
        if isRemote { remoteClock.position = mirror.position() }
        guard isRemote, mirror.state?.playing == true else {
            remoteTick?.cancel()
            remoteTick = nil
            return
        }
        guard remoteTick == nil else { return }
        remoteTick = Task { [weak self] in
            while !Task.isCancelled, let self {
                self.remoteClock.position = self.mirror.position()
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    /// Paused in the background the app is soon suspended: it leaves the picker, or picking it would stop the music.
    /// A remote stays one, so nothing on the lock screen or headphones starts this phone over the device that plays.
    private func followPlayback() {
        guard let link else { return }
        if isPlaying {
            if link.isClosed { link.connect() }
        } else if UIApplication.shared.applicationState == .background, !awaitingDevices {
            link.close()
            if isRemote {
                remoteTick?.cancel()
                remoteTick = nil
            } else {
                forgetSession()
            }
        }
    }

    /// Playing takes the session. Paused, only the device that holds it has anything to say.
    private func publish(force: Bool = false) {
        guard let link, !isRemote, current != nil, isPlaying || holdsSession else { return }
        let state = sessionState()
        let key = "\(state.songs.map(\.id).joined(separator: ","))|\(isPlaying)"
        guard force || key != published else { return }
        published = key
        lastPublish = Date()
        link.send(.state(state))
    }

    private func receive(_ message: DeviceMessage) {
        switch message {
        case .devices(let devices):
            let was = isRemote
            let awaited = awaitingDevices
            awaitingDevices = false
            holdsSession = devices.contains { $0.active && $0.id == clientID }
            let left = mirror.list(devices, me: clientID, playingHere: isPlaying)
            if isRemote, !was {
                offer = nil
                // What was heard here is a play of its own; nothing the other device does adds to it.
                finishPlay()
            }
            showRemote()
            if let left { gone(left) }
            // Moved here: `take` follows with where it was, so nothing older is published first.
            if was != isRemote || awaited, !holdsSession { updateNowPlaying() }
        case .state(let state):
            guard !isPlaying else { return }
            mirror.heard(state)
            showRemote()
        case .yield:
            holdsSession = false
            // Pausing in the background would close the socket before it hears who took over.
            awaitingDevices = true
            pause()
        case .take(let state):
            holdsSession = true
            keep(state)
            if state.playing { resume() }
        case .command(let command):
            // Only the playing device is sent these.
            guard !isRemote else { return }
            switch command {
            case .toggle(let playing): playing ? resume() : pause()
            case .next: next()
            case .previous: previous()
            case .seek(let seconds): seek(to: seconds)
            case .volume: break
            case .play(let songs, let start, let shuffle):
                play(songs, at: start)
                if shuffle { toggleShuffle() }
            case .add(let songs, let next): next ? playNext(songs) : addToQueue(songs)
            }
        }
    }

    /// The device that played is gone. Its spot is picked up, but this phone's own queue is only replaced if asked.
    private func gone(_ left: DeviceState) {
        switch left.leftover(upcoming: Array(queue.dropFirst(index))) {
        case .spot, .take: keep(left)
        case .offer: offer = RemoteQueue(songs: left.songs, index: 0, position: left.position, changed: "", changedBy: "")
        }
    }

    /// The session's queue and spot become this phone's, paused.
    private func keep(_ state: DeviceState) {
        if queue.dropFirst(index).prefix(DeviceState.maxSongs).map(\.id) == state.songs.map(\.id) {
            seek(to: state.position)
            // The device that had it already scrobbled anything past the point.
            scrobbled = pastScrobblePoint(position)
        } else {
            adopt(RemoteQueue(songs: state.songs, index: 0, position: state.position, changed: "", changedBy: ""))
        }
    }

    private func updateNowPlaying() {
        guard app != nil else { return }
        publish()
        followPlayback()
        // The lock screen is for what this phone plays; as a remote it plays nothing.
        system.show(isRemote ? nil : current, index: index, count: queue.count, position: position, duration: duration, playing: isPlaying, speed: engine.defaultRate, client: app?.needsSignIn == false ? app?.client : nil)
    }
}
