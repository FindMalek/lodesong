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
    /// When the server first saw it, ISO 8601, so it sorts as text.
    var created: String?
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
    var replayGain: ReplayGain?
    /// The server's count for this account, for an artist's top songs.
    var playCount: Int?
    /// Only history and stats read these: they are kept as the song was when it was played.
    var artistId: String?
    var year: Int?
    var genre: String?
    var genres: [Genre]?
}

struct Genre: Codable, Hashable {
    let name: String
}

struct ReplayGain: Codable, Hashable {
    var trackGain: Double?
    var albumGain: Double?
    var trackPeak: Double?
    var albumPeak: Double?
}

struct Playlist: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    var songCount: Int?
    var changed: String?
    var coverArt: String?
    /// Set on smart playlists, whose `changed` only moves once someone asks for their songs.
    var readonly: Bool?
    var validUntil: String?
}

/// Everything one sync brings back. Playlist entries are only listed for playlists that changed.
struct LibrarySnapshot {
    var artists: [Artist] = []
    var albums: [Album] = []
    var songs: [Song] = []
    var playlists: [Playlist] = []
    var entries: [String: [Song]] = [:]
}
