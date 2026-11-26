import Foundation
import Network
import SwiftUI

struct Library {
    var artists: [Artist] = []
    var albums: [Album] = []
    var songs: [Song] = []
    var playlists: [Playlist] = []
    var shelf = PlaylistShelf()
    var folder: FolderChoice?

    /// What the browsing pages show: everything, or only the chosen music folder.
    func browsing() -> Library {
        guard let folder else { return self }
        let ids = Set(folder.songs)
        var shown = self
        shown.songs = songs.filter { ids.contains($0.id) }
        let albumIDs = Set(shown.songs.compactMap(\.albumId))
        shown.albums = albums.filter { albumIDs.contains($0.id) }
        let artistIDs = Set(shown.albums.compactMap(\.artistId))
        shown.artists = artists.filter { artistIDs.contains($0.id) }
        return shown
    }

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
        didSet {
            browse = library.browsing()
            libraryRevision += 1
            showInSpotlight()
        }
    }
    /// The library as the browsing pages see it. Album, artist and playlist pages and search use all of it.
    private(set) var browse = Library()
    /// Counts alone miss a sync that only renames or swaps songs.
    private(set) var libraryRevision = 0
    @Published private(set) var syncing = false
    @Published var syncError: String?
    /// When the sync now running, or the last one, began.
    private(set) var syncStarted = Date.distantPast
    /// When the library last came in whole.
    @Published private(set) var lastSync = UserDefaults.standard.object(forKey: "lastSync") as? Date
    @Published var needsSignIn: Bool {
        didSet { showInSpotlight() }
    }

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
    /// Everything that asked for the sync now running.
    private var syncTriggers: Set<SyncTrigger> = []
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
        // `didSet` doesn't run in an initializer.
        browse = library.browsing()
        showInSpotlight()
        connectDownloads()
        checkPeriodically()
    }

    private func showInSpotlight() {
        Spotlight.show(needsSignIn ? [] : library.playlists)
    }

    /// Runs for as long as the app does; suspended in the background, it waits with it.
    private func checkPeriodically() {
        var seconds = 600
        #if DEBUG
        seconds = ProcessInfo.processInfo.environment["LODESONG_AUTO_SECONDS"].flatMap(Int.init) ?? seconds
        #endif
        let network = NWPathMonitor()
        network.start(queue: .global(qos: .utility))
        Task { [weak self, seconds] in
            defer { network.cancel() }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(seconds))
                guard let self else { return }
                // A whole library snapshot every time, so Wi-Fi only holds for it too.
                if downloads.wifiOnly, network.currentPath.isExpensive { continue }
                if downloads.autoPeriodic, !downloads.collections.isEmpty || downloads.allPlaylists { await sync(.periodic) }
            }
        }
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

    func sync(_ trigger: SyncTrigger = .manual) async {
        if let syncTask {
            syncTriggers.insert(trigger)
            return await syncTask.value
        }
        guard live != nil else { return }
        syncTriggers = [trigger]
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
            await sync(.background)
        } onCancel: {
            Task { @MainActor in syncTask?.cancel() }
        }
        await downloads.queued()
    }

    private func run(_ client: ServerClient) async {
        syncing = true
        syncStarted = Date()
        defer { syncing = false }
        do {
            try await LibrarySync.run(client: client, store: store)
            let store = store
            var loaded = await Task.detached { Self.load(store) }.value
            // A folder may have been picked while loading.
            loaded.folder = store.folder()
            library = loaded
            syncError = nil
            lastSync = Date()
            defaults.set(lastSync, forKey: "lastSync")
            downloads.librarySynced(triggers: syncTriggers)
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

    /// Counts picks, so a slow one doesn't undo a later one.
    private var folderPick = 0

    /// Nil shows everything again, which needs no server.
    func chooseFolder(_ folder: MusicFolder?) async throws {
        folderPick += 1
        let pick = folderPick
        var choice: FolderChoice?
        if let folder {
            guard let client = live else { throw ServerError.message("Connect to your server to pick a music folder.") }
            let account = user
            choice = FolderChoice(id: folder.id, name: folder.name, songs: try await client.songIDs(folder: folder.id))
            // Picked again, signed out or into another account while asking.
            guard pick == folderPick, !needsSignIn, self.client?.identity == client.identity, user == account else { return }
        }
        try store.saveFolder(choice)
        library.folder = choice
    }

    /// Changes need the server there and then: nothing is queued, so offline they are off rather than lost.
    var canEdit: Bool { live != nil && !offline }

    /// Runs one change to the playlists, then brings them in again so screens and downloads follow.
    /// `change` answers the id of a playlist it made. A failed change refreshes too: it may be why it failed.
    @discardableResult
    func editPlaylists(_ id: String?, _ change: (ServerClient) async throws -> String?) async throws -> String? {
        guard canEdit, let client = live else { throw ServerError.message("Connect to your server to edit playlists.") }
        // A sync that began before the change would write the old list back over it.
        await syncTask?.value
        var made: String?
        let result: Result<Void, Error>
        do {
            made = try await change(client)
            result = .success(())
        } catch {
            result = .failure(error)
        }
        await refreshPlaylists(client, changed: made ?? id)
        try result.get()
        return made ?? id
    }

    private func refreshPlaylists(_ client: ServerClient, changed: String?) async {
        do {
            try await LibrarySync.playlists(client: client, store: store, changed: changed)
        } catch {
            return AppLog.shared.add("Playlists not refreshed: \(error.localizedDescription)")
        }
        guard !needsSignIn, self.client?.identity == client.identity else { return }
        library = Self.load(store)
        downloads.librarySynced(edited: changed, triggers: [.followUp])
    }

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
        Library(artists: store.artists(), albums: store.albums(), songs: store.songs(), playlists: store.playlists(), shelf: store.shelf(), folder: store.folder())
    }
}
