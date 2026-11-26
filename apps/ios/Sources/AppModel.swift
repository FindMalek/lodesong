import Foundation
import SwiftUI

struct Library {
    var artists: [Artist] = []
    var albums: [Album] = []
    var songs: [Song] = []
    var playlists: [Playlist] = []
    var shelf = PlaylistShelf()

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
    @Published private(set) var library = Library() {
        didSet { libraryRevision += 1 }
    }
    /// Counts alone miss a sync that only renames or swaps songs.
    private(set) var libraryRevision = 0
    @Published private(set) var syncing = false
    @Published var syncError: String?
    /// When the library last came in whole.
    @Published private(set) var lastSync = UserDefaults.standard.object(forKey: "lastSync") as? Date
    @Published var needsSignIn: Bool

    /// Nothing goes to the server: downloaded music plays, the rest waits.
    @Published var offlineMode = UserDefaults.standard.bool(forKey: Pref.offlineMode) {
        didSet {
            guard offlineMode != oldValue else { return }
            defaults.set(offlineMode, forKey: Pref.offlineMode)
            AppLog.shared.add("Offline mode \(offlineMode ? "on" : "off")")
            connectDownloads()
            if offlineMode {
                syncError = nil
                Task { await stopSync() }
            } else {
                Task { await sync() }
            }
        }
    }
    /// Another way to the same server. Used by itself only between two https addresses, see `ServerAddresses`.
    @Published private(set) var secondServer = UserDefaults.standard.url(forKey: "server2")

    let downloads = DownloadsModel()
    private var syncTask: Task<Void, Never>?
    private var signOutTask: Task<Void, Never>?
    private let store: LibraryStore
    private let defaults = UserDefaults.standard

    var user: String { defaults.string(forKey: "user") ?? "" }
    var mainServer: URL? { defaults.url(forKey: "server") }
    /// The address chosen by hand, when switching isn't automatic.
    private var pickedServer: URL? { defaults.url(forKey: "serverPicked") }
    var switchesByItself: Bool { mainServer.map { ServerAddresses.automatic(main: $0, second: secondServer) } ?? false }
    /// Where a password may be asked for and sent: never a fallback.
    var signInAddress: URL? { mainServer.map { ServerAddresses.starting(main: $0, second: secondServer) } }
    /// The client to ask the server with, nil when nothing should be asked.
    var live: ServerClient? { needsSignIn || offlineMode ? nil : client }

    init() {
        let folder = URL.applicationSupportDirectory
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Without a database there is no app to show; a crash here is a full disk or a broken install.
        store = try! LibraryStore(path: folder.appending(path: "library.sqlite").path)
        let second = defaults.url(forKey: "server2")
        let picked = defaults.url(forKey: "serverPicked")
        client = defaults.url(forKey: "server").map { ServerClient(server: ServerAddresses.starting(main: $0, second: second, picked: picked), home: $0) }
        needsSignIn = defaults.string(forKey: "user") == nil || defaults.bool(forKey: "signedOut")
        library = Self.load(store)
        connectDownloads()
    }

    private func connectDownloads() {
        downloads.connect(client: client, user: user, store: store, signedIn: !needsSignIn && !offlineMode)
    }

    func signIn(server: URL, user: String, password: String) async throws {
        // A sync still running for the last account would use the new cookie and write into the new library.
        await stopSync()
        // Sign out drops every cookie when it finishes, which must not be the new one.
        await signOutTask?.value
        try await ServerClient(server: server).signIn(user: user, password: password)
        // Signing in again through the second address is the same account.
        let same = user == self.user && (server == mainServer || server == secondServer)
        if !same {
            try store.clear()
            library = Library()
            lastSync = nil
            defaults.removeObject(forKey: "lastSync")
            setSecondServer(nil)
        }
        let main = same ? mainServer ?? server : server
        defaults.set(main, forKey: "server")
        defaults.set(user, forKey: "user")
        defaults.set(false, forKey: "signedOut")
        // Typed by hand, so it is a pick.
        defaults.set(server, forKey: "serverPicked")
        client = ServerClient(server: server, home: main)
        syncError = nil
        needsSignIn = false
        offlineMode = false
        connectDownloads()
        AppLog.shared.add("Signed in at \(server.absoluteString)")
        await sync()
    }

    /// Signs in there too, since the session cookie belongs to one address, and checks it serves this library.
    func addSecondServer(_ server: URL, password: String) async throws {
        let other = ServerClient(server: server)
        try await other.signIn(user: user, password: password)
        let found = try await other.albumIDs()
        guard ServerAddresses.sameLibrary(known: Set(library.albums.map(\.id)), found: found) else {
            throw ServerError.message("That server has a different library.")
        }
        setSecondServer(server)
        await chooseAddress()
    }

    func removeSecondServer() {
        setSecondServer(nil)
        if let main = mainServer { move(to: main) }
    }

    /// The user's own choice of address.
    func use(_ server: URL) {
        defaults.set(server, forKey: "serverPicked")
        syncError = nil
        move(to: server)
        Task { await sync() }
    }

    private func move(to server: URL) {
        guard let main = mainServer, server != client?.server else { return }
        client = ServerClient(server: server, home: main)
        connectDownloads()
        AppLog.shared.add("Now using \(server.absoluteString)")
    }

    private func setSecondServer(_ server: URL?) {
        secondServer = server
        defaults.set(server, forKey: "server2")
        defaults.removeObject(forKey: "serverPicked")
    }

    /// Moves to the address to be on now. Files stay keyed to the main one, so nothing is fetched twice.
    func chooseAddress() async {
        guard !offlineMode, let main = mainServer, let second = secondServer, let current = client?.server else { return }
        let picked = pickedServer
        let next = await ServerAddresses.pick(main: main, second: second, picked: picked, current: current) { await ServerClient(server: $0).reachable() }
        // Signed out or changed while asking.
        guard !needsSignIn, !offlineMode, secondServer == second, mainServer == main, pickedServer == picked else { return }
        move(to: next)
    }

    func sync() async {
        if let syncTask { return await syncTask.value }
        guard live != nil else { return }
        let task = Task {
            await chooseAddress()
            if let client = live, !Task.isCancelled { await run(client) }
        }
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
            AppLog.shared.add("Synced \(library.songs.count) songs")
        } catch ServerError.signedOut {
            guard !Task.isCancelled else { return }
            guard let home = signInAddress, client.server != home else { return needsSignIn = true }
            // A fallback saying no is not a reason to ask for the password there: go back instead.
            defaults.removeObject(forKey: "serverPicked")
            move(to: home)
            syncError = "The other address didn't accept the sign in. Remove it and add it again."
            AppLog.shared.add("Sign in refused at \(client.server.absoluteString)")
        } catch {
            if !Task.isCancelled {
                syncError = error.localizedDescription
                AppLog.shared.add("Sync with \(client.server.absoluteString) failed: \(error.localizedDescription)")
            }
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
        connectDownloads()
        // Nothing is posted to a plain http address that isn't in use.
        let others = [mainServer, secondServer].compactMap { $0 }.filter { $0 != client?.server && $0.scheme == "https" }
        signOutTask = Task {
            await stopSync()
            await client?.signOut()
            for server in others { await ServerClient(server: server).signOut() }
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
        Library(artists: store.artists(), albums: store.albums(), songs: store.songs(), playlists: store.playlists(), shelf: store.shelf())
    }
}
