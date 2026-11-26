import Foundation

enum LibrarySync {
    /// Fetches everything before writing anything, so losing the network never empties the library.
    static func run(client: ServerClient, store: LibraryStore, pictures: URL = ShelfSync.pictures) async throws {
        let snapshot = try await client.librarySnapshot(knownPlaylists: store.playlistStamps())
        try Task.checkCancellation()
        try store.apply(snapshot)
        // The library is in by now: a folder that can't be asked about keeps its old songs rather than failing the sync.
        do {
            try await refreshFolder(client: client, store: store)
        } catch {
            try Task.checkCancellation()
            AppLog.shared.add("Music folder not refreshed: \(error.localizedDescription)")
        }
        await ShelfSync.run(client: client, store: store, pictures: pictures)
    }

    /// Songs come and go in the chosen folder, and the folder itself may be gone.
    private static func refreshFolder(client: ServerClient, store: LibraryStore) async throws {
        guard var choice = store.folder() else { return }
        let there = try await client.musicFolders().contains { $0.id == choice.id }
        if there { choice.songs = try await client.songIDs(folder: choice.id) }
        try Task.checkCancellation()
        // Another folder may have been picked while asking.
        guard store.folder()?.id == choice.id else { return }
        try store.saveFolder(there ? choice : nil)
    }

    /// Brings in the playlists alone, after one was changed from here.
    static func playlists(client: ServerClient, store: LibraryStore, changed: String?) async throws {
        let playlists = try await client.playlists()
        let known = store.playlistStamps()
        var entries: [String: [Song]] = [:]
        // Any other playlist that moved is fetched too: storing its new stamp without its songs would hide the change.
        for playlist in playlists where playlist.id == changed || playlist.changed == nil || known[playlist.id] != playlist.changed {
            entries[playlist.id] = try await client.playlistSongs(playlist.id)
        }
        try store.applyPlaylists(playlists, entries: entries)
    }
}
