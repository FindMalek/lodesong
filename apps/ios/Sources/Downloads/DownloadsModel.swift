import Foundation

enum DownloadState: Equatable {
    case none
    case downloading(done: Int, total: Int)
    case downloaded
}

/// What every screen and the player use for offline files. Does nothing until downloads land (#593).
@MainActor
final class DownloadsModel: ObservableObject {
    func state(playlist id: String) -> DownloadState { .none }
    func state(album id: String) -> DownloadState { .none }
    func keep(playlist id: String) {}
    func keep(album id: String) {}
    func remove(playlist id: String) {}
    func remove(album id: String) {}
    /// The file on the phone for a song, if there is a complete one.
    func localURL(song id: String) -> URL? { nil }
    /// Call after every library sync so kept playlists follow their changes.
    func librarySynced() {}
}
