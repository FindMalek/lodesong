import Foundation

enum LibrarySync {
    /// Fetches everything before writing anything, so losing the network never empties the library.
    static func run(client: ServerClient, store: LibraryStore) async throws {
        let snapshot = try await client.librarySnapshot(knownPlaylists: store.playlistStamps())
        try store.apply(snapshot)
    }
}
