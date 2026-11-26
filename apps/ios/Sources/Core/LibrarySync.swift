import Foundation

enum LibrarySync {
    /// Fetches everything before writing anything, so losing the network never empties the library.
    static func run(client: ServerClient, store: LibraryStore, pictures: URL = ShelfSync.pictures) async throws {
        let snapshot = try await client.librarySnapshot(knownPlaylists: store.playlistStamps())
        try Task.checkCancellation()
        try store.apply(snapshot)
        await ShelfSync.run(client: client, store: store, pictures: pictures)
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
