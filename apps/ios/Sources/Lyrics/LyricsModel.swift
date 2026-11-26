import Combine
import Foundation

/// The lyrics on this phone, and what fills them: songs as their lyrics are opened, and every song kept for offline.
@MainActor
final class LyricsModel: ObservableObject {
    /// Moves when lyrics were added, so search can pick them up.
    @Published private(set) var revision = 0

    private var app: AppModel?
    private var cached: (key: String, store: LyricsStore)?
    private var watching: AnyCancellable?
    private var filling: Task<Void, Never>?

    func attach(app: AppModel) {
        guard self.app == nil else { return }
        self.app = app
        watching = app.objectWillChange.merge(with: app.downloads.objectWillChange)
            .throttle(for: .seconds(5), scheduler: RunLoop.main, latest: true)
            .sink { [weak self] _ in self?.fill() }
        fill()
    }

    /// Each account has its own folder: song ids are only unique on one server.
    private var store: LyricsStore? {
        guard let app, let server = app.client?.server else { return nil }
        let key = DownloadLibrary.folder(server: server, user: app.user)
        if let cached, cached.key == key { return cached.store }
        let store = LyricsStore(root: URL.applicationSupportDirectory.appending(path: "Lyrics/\(key)"))
        cached = (key, store)
        return store
    }

    private var client: ServerClient? { app?.needsSignIn == false ? app?.client : nil }

    func saved(_ song: String) -> SavedLyrics? { store?.load(song) }

    func all() async -> [String: Lyrics] {
        guard let store else { return [:] }
        return await Task.detached { store.all() }.value
    }

    /// Brings one song up to date with the server. Nil when there is nothing on the phone and no way to ask.
    func refresh(_ song: String) async -> SavedLyrics? {
        guard let store else { return nil }
        guard let client else { return store.load(song) }
        var saved = store.load(song)
        if saved == nil || saved?.lyrics.status == .missing, let lyrics = try? await client.lyrics(song: song) {
            saved = store.save(lyrics, song: song)
            if !lyrics.lines.isEmpty { revision += 1 }
        }
        await syncNudge(song, store: store, client: client)
        return store.load(song)
    }

    func nudge(_ song: String, to value: Int) {
        guard let store else { return }
        store.setNudge(value, song: song, pending: true)
        if let client { Task { await syncNudge(song, store: store, client: client) } }
    }

    /// A correction made here goes up; otherwise the one saved on the server, from any browser, comes down.
    private func syncNudge(_ song: String, store: LyricsStore, client: ServerClient) async {
        guard let saved = store.load(song) else { return }
        if saved.nudgePending {
            if await client.setLyricsNudge(saved.nudge, song: song), store.load(song)?.nudge == saved.nudge {
                store.setNudge(saved.nudge, song: song, pending: false)
            }
        } else if let nudge = try? await client.lyricsNudge(song: song), store.load(song)?.nudgePending == false {
            store.setNudge(nudge, song: song, pending: false)
        }
    }

    /// Lyrics and covers go with every kept song. Stops when the network does, and tries again on the next change.
    private func fill() {
        guard filling == nil, let app, let client, let store else { return }
        var seen = Set<String>()
        let songs = app.downloads.collections.flatMap(\.songs).filter { seen.insert($0.id).inserted }
        guard !songs.isEmpty else { return }
        filling = Task {
            await fill(songs, store: store, client: client)
            filling = nil
        }
    }

    /// Lyrics first, they are small; then covers.
    private func fill(_ songs: [Song], store: LyricsStore, client: ServerClient) async {
        // Signed out or another account: what is left belongs to nobody here.
        func current() -> Bool { self.client?.server == client.server && self.store === store }
        // Thousands of kept songs are thousands of files to look at, so not on the main thread.
        let wanted = await Task.detached {
            songs.filter { store.wants($0.id) || store.load($0.id)?.nudgePending == true }
        }.value
        var added = 0
        defer { if added > 0 { revision += 1 } }
        var failures = 0
        for song in wanted {
            guard current() else { return }
            if store.load(song.id)?.nudgePending == true { await syncNudge(song.id, store: store, client: client) }
            guard store.wants(song.id) else { continue }
            do {
                let lyrics = try await client.lyrics(song: song.id)
                store.save(lyrics, song: song.id)
                failures = 0
            } catch is URLError {
                return
            } catch {
                // One song the server can't answer for must not hold back the rest; three in a row is the server.
                failures += 1
                if failures == 3 { return }
                continue
            }
            await syncNudge(song.id, store: store, client: client)
            added += 1
            if added.isMultiple(of: 100) { revision += 1 }
        }
        for cover in Set(songs.compactMap(\.coverArt)) {
            guard current() else { return }
            do { try await ArtworkCache.shared.keep(cover, client: client) } catch { return }
        }
    }
}
