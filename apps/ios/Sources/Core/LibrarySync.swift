import Foundation

enum LibrarySync {
    /// Fetches everything before writing anything, so losing the network never empties the library.
    static func run(client: ServerClient, store: LibraryStore, pictures: URL = ShelfSync.pictures) async throws {
        let snapshot = try await client.librarySnapshot(knownPlaylists: store.playlistStamps())
        try Task.checkCancellation()
        try store.apply(snapshot)
        await ShelfSync.run(client: client, store: store, pictures: pictures)
    }
}
