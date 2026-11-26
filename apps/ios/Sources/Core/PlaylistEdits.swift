import Foundation

extension Playlist {
    /// Smart and read-only playlists are the server's to fill, and someone else's public one is only for listening.
    func editable(by user: String) -> Bool {
        readonly != true && validUntil == nil && (owner.map { $0.caseInsensitiveCompare(user) == .orderedSame } ?? true)
    }
}

enum PlaylistEditError: LocalizedError, Equatable {
    case changedElsewhere

    var errorDescription: String? { "This playlist changed on the server. Nothing was saved, so check it and try again." }
}

/// What it takes to turn one list of songs into another.
enum PlaylistSongChange: Equatable {
    case none
    case remove([Int])
    case rewrite([String])

    init(from old: [String], to new: [String]) {
        var removed: [Int] = []
        var next = 0
        for (index, id) in old.enumerated() {
            if next < new.count && new[next] == id { next += 1 } else { removed.append(index) }
        }
        // Only removals, in the same order, can be named by position. Anything else sends the whole list.
        if next < new.count {
            self = .rewrite(new)
        } else {
            self = removed.isEmpty ? .none : .remove(removed)
        }
    }
}

/// Playlist changes, as the Subsonic API has them. All form posts: a long playlist has no URL limit.
extension ServerClient {
    private struct Answer: Decodable {
        struct Body: Decodable {
            struct List: Decodable {
                var id: String?
                var entry: [Song]?
            }
            var playlist: List?
        }
        let body: Body
        enum CodingKeys: String, CodingKey { case body = "subsonic-response" }
    }

    @discardableResult
    private func playlistCall(_ endpoint: String, _ fields: [(String, String)]) async throws -> Answer.Body {
        try JSONDecoder().decode(Answer.self, from: try await post(rest: endpoint, fields)).body
    }

    func playlistSongs(_ id: String) async throws -> [Song] {
        try await playlistCall("getPlaylist", [("id", id)]).playlist?.entry ?? []
    }

    /// The new playlist's id, when the server says it.
    func createPlaylist(name: String, songs: [String]) async throws -> String? {
        try await playlistCall("createPlaylist", [("name", name)] + songs.map { ("songId", $0) }).playlist?.id
    }

    func addToPlaylist(_ id: String, songs: [String]) async throws {
        try await playlistCall("updatePlaylist", [("playlistId", id)] + songs.map { ("songIdToAdd", $0) })
    }

    /// Only what is given changes.
    func updatePlaylist(_ id: String, name: String? = nil, comment: String? = nil, isPublic: Bool? = nil) async throws {
        var fields = [("playlistId", id)]
        if let name { fields.append(("name", name)) }
        if let comment { fields.append(("comment", comment)) }
        if let isPublic { fields.append(("public", String(isPublic))) }
        try await playlistCall("updatePlaylist", fields)
    }

    func deletePlaylist(_ id: String) async throws {
        try await playlistCall("deletePlaylist", [("id", id)])
    }

    /// Removes and reorders. Both go by position, so they are only sent while the server's list is still the one
    /// the change was made from.
    func changeSongs(playlist id: String, from old: [String], to new: [String]) async throws {
        let change = PlaylistSongChange(from: old, to: new)
        guard change != .none else { return }
        guard try await playlistSongs(id).map(\.id) == old else { throw PlaylistEditError.changedElsewhere }
        switch change {
        case .none: break
        case .remove(let indexes): try await playlistCall("updatePlaylist", [("playlistId", id)] + indexes.map { ("songIndexToRemove", String($0)) })
        case .rewrite(let songs): try await playlistCall("createPlaylist", [("playlistId", id)] + songs.map { ("songId", $0) })
        }
    }
}
