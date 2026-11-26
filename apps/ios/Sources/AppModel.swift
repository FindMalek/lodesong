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
    @Published var needsSignIn: Bool

    private let store: LibraryStore
    private let defaults = UserDefaults.standard

    var user: String { defaults.string(forKey: "user") ?? "" }

    init() {
        let folder = URL.applicationSupportDirectory
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Without a database there is no app to show; a crash here is a full disk or a broken install.
        store = try! LibraryStore(path: folder.appending(path: "library.sqlite").path)
        client = defaults.url(forKey: "server").map { ServerClient(server: $0) }
        needsSignIn = defaults.string(forKey: "user") == nil
        library = Self.load(store)
    }

    func signIn(server: URL, user: String, password: String) async throws {
        let client = ServerClient(server: server)
        try await client.signIn(user: user, password: password)
        if server != defaults.url(forKey: "server") || user != self.user {
            try store.clear()
            library = Library()
        }
        defaults.set(server, forKey: "server")
        defaults.set(user, forKey: "user")
        self.client = client
        syncError = nil
        needsSignIn = false
        await sync()
    }

    func sync() async {
        guard let client, !needsSignIn, !syncing else { return }
        syncing = true
        defer { syncing = false }
        do {
            try await LibrarySync.run(client: client, store: store)
            let store = store
            library = await Task.detached { Self.load(store) }.value
            syncError = nil
        } catch ServerError.signedOut {
            needsSignIn = true
        } catch {
            syncError = error.localizedDescription
        }
    }

    func entries(playlist id: String) -> [Song] { store.entries(playlist: id) }

    /// The library stays on the phone, so signing back into the same account shows it straight away.
    func signOut() {
        HTTPCookieStorage.shared.removeCookies(since: .distantPast)
        needsSignIn = true
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
