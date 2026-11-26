import BackgroundTasks
import Foundation

enum DownloadState: Equatable {
    case none
    case downloading(done: Int, total: Int)
    case downloaded
}

/// What every screen and the player use for offline files. One per app: it owns the background session.
/// Everything it answers is for the account last connected.
@MainActor
final class DownloadsModel: ObservableObject {
    static let refreshTask = "engineer.findmalek.lodesong.ios.refresh"

    @Published var wifiOnly = UserDefaults.standard.object(forKey: "downloadWifiOnly") as? Bool ?? true {
        didSet {
            UserDefaults.standard.set(wifiOnly, forKey: "downloadWifiOnly")
            schedule()
        }
    }
    /// Applies to songs downloaded from now on; files already on the phone are left alone.
    @Published var quality = DownloadQuality(rawValue: UserDefaults.standard.integer(forKey: "downloadQuality")) ?? .original {
        didSet {
            UserDefaults.standard.set(quality.rawValue, forKey: "downloadQuality")
            schedule()
        }
    }
    /// Whether kept playlists and albums take changes when the app opens, and while it runs.
    @Published var autoOnOpen = UserDefaults.standard.bool(Pref.autoDownloadOnOpen, or: true) {
        didSet { UserDefaults.standard.set(autoOnOpen, forKey: Pref.autoDownloadOnOpen) }
    }
    @Published var autoPeriodic = UserDefaults.standard.bool(Pref.autoDownloadPeriodic, or: false) {
        didSet { UserDefaults.standard.set(autoPeriodic, forKey: Pref.autoDownloadPeriodic) }
    }
    /// How many songs transfer at once; zero leaves it to iOS.
    @Published var atOnce = UserDefaults.standard.integer(forKey: Pref.concurrentDownloads) {
        didSet {
            UserDefaults.standard.set(atOnce, forKey: Pref.concurrentDownloads)
            schedule()
        }
    }
    /// Takes every playlist, those made later too. Turning it off keeps what is already here.
    var allPlaylists: Bool {
        get { library?.allPlaylists ?? false }
        set {
            library?.allPlaylists = newValue
            revision += 1
            keepPlaylists()
        }
    }
    @Published private(set) var failed: Set<String> = []
    @Published private var revision = 0

    private var library: DownloadLibrary?
    /// Made with the first account, so nothing is delivered before there is somewhere to put it.
    private var session: DownloadSession?
    private var scheduling: Task<Void, Never>?
    private var client: ServerClient?
    private var store: LibraryStore?

    var collections: [KeptCollection] { library?.collections ?? [] }
    var failures: Int { failed.count }
    var pending: [Song] { library?.pending() ?? [] }
    var songs: [Song] { library?.downloaded() ?? [] }
    var totalBytes: Int { library?.totalBytes() ?? 0 }
    func bytes(_ ref: DownloadRef) -> Int { library?.bytes(ref) ?? 0 }
    func state(_ ref: DownloadRef) -> DownloadState {
        guard let progress = library?.progress(ref) else { return .none }
        return progress.done == progress.total ? .downloaded : .downloading(done: progress.done, total: progress.total)
    }

    func state(playlist id: String) -> DownloadState { state(DownloadRef(kind: .playlist, id: id)) }
    func state(album id: String) -> DownloadState { state(DownloadRef(kind: .album, id: id)) }
    func keep(playlist id: String) { keep(DownloadRef(kind: .playlist, id: id)) }
    func keep(album id: String) { keep(DownloadRef(kind: .album, id: id)) }
    func remove(playlist id: String) { remove(DownloadRef(kind: .playlist, id: id)) }
    func remove(album id: String) { remove(DownloadRef(kind: .album, id: id)) }
    /// The file on the phone for a song, if there is a complete one.
    func localURL(song id: String) -> URL? { library?.localURL(song: id) }

    /// The account's server. Picks the queue back up without waiting for a sync; signed out, nothing transfers
    /// and the files stay readable.
    func connect(client: ServerClient?, user: String, store: LibraryStore, signedIn: Bool = true) {
        self.client = signedIn ? client : nil
        self.store = store
        if let client {
            let key = DownloadLibrary.folder(server: client.identity, user: user)
            if library?.key != key {
                library = DownloadLibrary(root: URL.applicationSupportDirectory.appending(path: "Downloads/\(key)"))
                failed = []
                revision += 1
            }
        }
        if session == nil, let library {
            session = DownloadSession(library: library) { [weak self] failed in
                Task { @MainActor in
                    self?.failed = failed
                    self?.revision += 1
                }
            }
        }
        schedule(retry: true)
    }

    /// Call after every library sync so kept playlists follow their changes.
    /// `edited` was changed from this phone, so its new tracks are no news.
    func librarySynced(edited: String? = nil, triggers: Set<SyncTrigger>) {
        guard let store, let library else { return }
        let before = library.collections
        library.sync(with: store, triggers: triggers, edited: edited, onOpen: autoOnOpen, periodic: autoPeriodic)
        Notices.post(NewTracks.found(before: before, after: library.collections).filter { $0.playlist != edited })
        revision += 1
        schedule(retry: true)
    }

    /// A playlist's own choice over the app's settings; nil goes by them.
    func follows(playlist id: String) -> Bool? {
        collections.first { $0.ref == DownloadRef(kind: .playlist, id: id) }?.follows
    }

    func setFollows(_ follows: Bool?, playlist id: String) {
        guard let library, let store else { return }
        library.setFollows(follows, DownloadRef(kind: .playlist, id: id))
        // Turned on: catch up now rather than at the next sync.
        if follows == true { library.reconcile(with: store, manual: false, auto: false) }
        revision += 1
        schedule(retry: true)
    }

    /// Whether songs added to this playlist later come down without a tap.
    func takesNewSongs(playlist id: String) -> Bool { follows(playlist: id) ?? (autoOnOpen || autoPeriodic) }

    func remove(_ ref: DownloadRef) {
        library?.remove(ref)
        revision += 1
        schedule()
    }

    /// Asks iOS to wake the app later for a sync; it decides when, or whether.
    func scheduleRefresh() {
        guard !collections.isEmpty else { return }
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshTask)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    func finishBackgroundEvents() async { await session?.finishEvents() }

    /// Waits for the latest changes to reach the system's queue.
    func queued() async { await scheduling?.value }

    /// Downloads made before an update never went through `keep`, so a foreground launch asks for them.
    func askForNoticesIfKept() async {
        guard library?.collections.isEmpty == false else { return }
        if UserDefaults.standard.bool(Pref.notifyNewTracks, or: true) || Notices.expiry != nil { await Notices.askPermission() }
    }

    /// Tries the songs that failed again.
    func retry() { schedule(retry: true) }

    private func keepPlaylists() {
        guard allPlaylists, let store, let library else { return }
        library.keepPlaylists(from: store)
        revision += 1
        schedule(retry: true)
    }

    private func keep(_ ref: DownloadRef) {
        guard let store, let library else { return }
        library.keep(ref, from: store)
        // The first download is when a notification means something; asking at first launch doesn't.
        let tracksWanted = ref.kind == .playlist && UserDefaults.standard.bool(Pref.notifyNewTracks, or: true)
        if tracksWanted || Notices.expiry != nil { Task { await Notices.askPermission() } }
        revision += 1
        schedule(retry: true)
    }

    private func schedule(retry: Bool = false) {
        guard let session, let library else { return }
        let (client, quality, wifiOnly, limit, previous) = (client, quality, wifiOnly, atOnce, scheduling)
        scheduling = Task {
            await previous?.value
            await session.schedule(library, client: client, quality: quality, wifiOnly: wifiOnly, limit: limit, retry: retry)
        }
    }
}
