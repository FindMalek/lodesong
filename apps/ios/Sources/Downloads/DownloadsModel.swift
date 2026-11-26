import BackgroundTasks
import Foundation

enum DownloadState: Equatable {
    case none
    case downloading(done: Int, total: Int)
    case downloaded
}

/// What every screen and the player use for offline files. One per app: it owns the background session.
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
    @Published private(set) var failures = 0
    @Published private var revision = 0

    private let library = DownloadLibrary(root: URL.applicationSupportDirectory.appending(path: "Downloads"))
    private var session: DownloadSession!
    private var client: ServerClient?
    private var store: LibraryStore?

    init() {
        session = DownloadSession(library: library) { [weak self] failures in
            Task { @MainActor in
                self?.failures = failures
                self?.revision += 1
            }
        }
    }

    var collections: [KeptCollection] { library.collections }
    var totalBytes: Int { library.totalBytes() }
    func bytes(_ ref: DownloadRef) -> Int { library.bytes(ref) }
    func state(_ ref: DownloadRef) -> DownloadState {
        guard let progress = library.progress(ref) else { return .none }
        return progress.done == progress.total ? .downloaded : .downloading(done: progress.done, total: progress.total)
    }

    func state(playlist id: String) -> DownloadState { state(DownloadRef(kind: .playlist, id: id)) }
    func state(album id: String) -> DownloadState { state(DownloadRef(kind: .album, id: id)) }
    func keep(playlist id: String) { keep(DownloadRef(kind: .playlist, id: id)) }
    func keep(album id: String) { keep(DownloadRef(kind: .album, id: id)) }
    func remove(playlist id: String) { remove(DownloadRef(kind: .playlist, id: id)) }
    func remove(album id: String) { remove(DownloadRef(kind: .album, id: id)) }
    /// The file on the phone for a song, if there is a complete one.
    func localURL(song id: String) -> URL? { library.localURL(song: id) }

    /// The signed-in server, or nil when signed out. Picks the queue back up without waiting for a sync.
    func connect(client: ServerClient?, store: LibraryStore) {
        self.client = client
        self.store = store
        schedule(retry: true)
    }

    /// Call after every library sync so kept playlists follow their changes.
    func librarySynced() {
        guard let store else { return }
        library.reconcile(with: store)
        revision += 1
        schedule(retry: true)
    }

    func remove(_ ref: DownloadRef) {
        library.remove(ref)
        revision += 1
        schedule()
    }

    /// Asks iOS to wake the app later for a sync; it decides when, or whether.
    func scheduleRefresh() {
        guard !library.collections.isEmpty else { return }
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshTask)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    func finishBackgroundEvents() async { await session.finishEvents() }

    private func keep(_ ref: DownloadRef) {
        guard let store else { return }
        library.keep(ref, from: store)
        revision += 1
        schedule(retry: true)
    }

    private func schedule(retry: Bool = false) {
        session.schedule(client: client, quality: quality, wifiOnly: wifiOnly, retry: retry)
    }
}
