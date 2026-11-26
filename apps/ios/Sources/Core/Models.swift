import Foundation

struct Artist: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    var coverArt: String?
}

struct Album: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    var artist: String?
    var artistId: String?
    var coverArt: String?
    var year: Int?
}

struct Song: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    var artist: String?
    var album: String?
    var albumId: String?
    var coverArt: String?
    var track: Int?
    var discNumber: Int?
    var duration: Int?
    var suffix: String?
}

struct Playlist: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    var songCount: Int?
    var changed: String?
    var coverArt: String?
}

/// Everything one sync brings back. Playlist entries are only listed for playlists that changed.
struct LibrarySnapshot {
    var artists: [Artist] = []
    var albums: [Album] = []
    var songs: [Song] = []
    var playlists: [Playlist] = []
    var entries: [String: [Song]] = [:]
}
