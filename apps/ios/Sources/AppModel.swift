import Foundation
import SwiftUI

struct Library {
    var artists: [Artist] = []
    var albums: [Album] = []
    var songs: [Song] = []
    var playlists: [Playlist] = []

    func songs(album id: String) -> [Song] {
        songs.filter { $0.albumId == id }.sorted { ($0.discNumber ?? 1, $0.track ?? 0) < ($1.discNumber ?? 1, $1.track ?? 0) }
    }

    func albums(artist id: String) -> [Album] {
        albums.filter { $0.artistId == id }.sorted { ($0.year ?? 0) < ($1.year ?? 0) }
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var client: ServerClient?
    @Published private(set) var library = Library()
    @Published private(set) var syncing = false
    @Published var syncError: String?
    /// When the library last came in whole.
    @Published private(set) var lastSync = UserDefaults.standard.object(forKey: "lastSync") as? Date
    @Published var needsSignIn: Bool

    let downloads = DownloadsModel()
    private var syncTask: Task<Void, Never>?
    private var signOutTask: Task<Void, Never>?
    private let store: LibraryStore
    private let defaults = UserDefaults.standard

    var user: String { defaults.string(forKey: "user") ?? "" }

    init() {
        let folder = URL.applicationSupportDirectory
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Without a database there is no app to show; a crash here is a full disk or a broken install.
        store = try! LibraryStore(path: folder.appending(path: "library.sqlite").path)
        client = defaults.url(forKey: "server").map { ServerClient(server: $0) }
        needsSignIn = defaults.string(forKey: "user") == nil || defaults.bool(forKey: "signedOut")
        library = Self.load(store)
        downloads.connect(client: client, user: user, store: store, signedIn: !needsSignIn)
    }

    func signIn(server: URL, user: String, password: String) async throws {
        // A sync still running for the last account would use the new cookie and write into the new library.
        await stopSync()
        // Sign out drops every cookie when it finishes, which must not be the new one.
        await signOutTask?.value
        let client = ServerClient(server: server)
        try await client.signIn(user: user, password: password)
        if server != defaults.url(forKey: "server") || user != self.user {
            try store.clear()
            library = Library()
            lastSync = nil
            defaults.removeObject(forKey: "lastSync")
        }
        defaults.set(server, forKey: "server")
        defaults.set(user, forKey: "user")
        defaults.set(false, forKey: "signedOut")
        self.client = client
        syncError = nil
        needsSignIn = false
        downloads.connect(client: client, user: user, store: store)
        await sync()
    }

    func sync() async {
        if let syncTask { return await syncTask.value }
        guard let client, !needsSignIn else { return }
        let task = Task { await run(client) }
        syncTask = task
        await task.value
        if syncTask == task { syncTask = nil }
    }

    /// The system's background wake: ends the sync when iOS takes the time back, and returns once downloads are queued.
    func backgroundRefresh() async {
        await withTaskCancellationHandler {
            await sync()
        } onCancel: {
            Task { @MainActor in syncTask?.cancel() }
        }
        await downloads.queued()
    }

    private func run(_ client: ServerClient) async {
        syncing = true
        defer { syncing = false }
        do {
            try await LibrarySync.run(client: client, store: store)
            let store = store
            library = await Task.detached { Self.load(store) }.value
            syncError = nil
            lastSync = Date()
            defaults.set(lastSync, forKey: "lastSync")
            downloads.librarySynced()
        } catch ServerError.signedOut {
            if !Task.isCancelled { needsSignIn = true }
        } catch {
            if !Task.isCancelled { syncError = error.localizedDescription }
        }
    }

    private func stopSync() async {
        let task = syncTask
        syncTask = nil
        task?.cancel()
        await task?.value
    }

    func entries(playlist id: String) -> [Song] { store.entries(playlist: id) }

    /// The library stays on the phone, so signing back into the same account shows it straight away.
    func signOut() {
        defaults.set(true, forKey: "signedOut")
        needsSignIn = true
        downloads.connect(client: client, user: user, store: store, signedIn: false)
        signOutTask = Task {
            await stopSync()
            await client?.signOut()
            HTTPCookieStorage.shared.removeCookies(since: .distantPast)
        }
    }

    #if DEBUG
    /// Lets a simulator run sign itself in for screenshots: pass the three values as environment variables.
    func debugSignIn() async {
        let env = ProcessInfo.processInfo.environment
        guard let raw = env["LODESONG_SERVER"], let url = ServerClient.normalize(raw) else { return }
        try? await signIn(server: url, user: env["LODESONG_USER"] ?? "", password: env["LODESONG_PASSWORD"] ?? "")
    }
    #endif

    private nonisolated static func load(_ store: LibraryStore) -> Library {
        Library(artists: store.artists(), albums: store.albums(), songs: store.songs(), playlists: store.playlists())
    }
}
