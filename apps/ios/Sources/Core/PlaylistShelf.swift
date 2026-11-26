import Foundation

struct PlaylistFolder: Codable, Identifiable, Hashable {
    let id: String
    var parentId: String?
    let name: String
    /// Changes when the picture does; nil shows the generated one.
    var coverVersion: String?
}

struct FolderItem: Codable, Hashable {
    let playlistId: String
    let folderId: String
}

/// A playlist whose cover is not the four-album mosaic: `dither` or `image`.
struct CoverChoice: Codable, Hashable {
    let playlistId: String
    let kind: String
    let version: String
}

/// What lodesong keeps about playlists that Navidrome doesn't.
struct PlaylistShelf {
    var folders: [PlaylistFolder] = []
    var items: [FolderItem] = []
    var covers: [CoverChoice] = []

    func cover(playlist id: String) -> CoverChoice? { covers.first { $0.playlistId == id } }
}

/// A folder as the web player shows it: a real one, or one read from a "Chill / Night" name.
struct FolderNode: Identifiable {
    /// The folder's own id, or a path starting with "/" for one that only exists in playlist names.
    let id: String
    var name = ""
    var coverVersion: String?
    var folders: [FolderNode] = []
    var playlists: [Playlist] = []

    var real: Bool { !id.isEmpty && !id.hasPrefix("/") }
    var allPlaylists: [Playlist] { playlists + folders.flatMap(\.allPlaylists) }
    var allFolders: [FolderNode] { folders + folders.flatMap(\.allFolders) }

    private static let separator = " / "

    static func tree(_ playlists: [Playlist], _ shelf: PlaylistShelf) -> FolderNode {
        let ids = Set(shelf.folders.map(\.id))
        let children = Dictionary(grouping: shelf.folders) { folder in folder.parentId.flatMap { ids.contains($0) ? $0 : nil } ?? "" }
        let placed = Dictionary(shelf.items.map { ($0.playlistId, $0.folderId) }, uniquingKeysWith: { first, _ in first })
        var inside: [String: [Playlist]] = [:]
        var loose = FolderNode(id: "")
        for playlist in playlists {
            if let folder = placed[playlist.id], ids.contains(folder) {
                inside[folder, default: []].append(playlist)
            } else {
                loose.insert(playlist, path: playlist.name.components(separatedBy: separator).dropLast()[...])
            }
        }
        func build(_ folder: PlaylistFolder) -> FolderNode {
            FolderNode(
                id: folder.id, name: folder.name, coverVersion: folder.coverVersion,
                folders: (children[folder.id] ?? []).map(build), playlists: inside[folder.id] ?? []
            )
        }
        loose.folders += (children[""] ?? []).map(build)
        loose.sortFolders()
        return loose
    }

    private mutating func insert(_ playlist: Playlist, path: ArraySlice<String>) {
        guard let part = path.first else { return playlists.append(playlist) }
        let key = "\(id)/\(part)"
        let index = folders.firstIndex { $0.id == key } ?? {
            folders.append(FolderNode(id: key, name: part))
            return folders.count - 1
        }()
        folders[index].insert(playlist, path: path.dropFirst())
    }

    private mutating func sortFolders() {
        folders.sort { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        for index in folders.indices { folders[index].sortFolders() }
    }

    /// The folder with this id and the names leading to it.
    func find(_ key: String, chain: [String] = []) -> (node: FolderNode, chain: [String])? {
        if id == key { return (self, chain) }
        for folder in folders {
            if let found = folder.find(key, chain: chain + [folder.name]) { return found }
        }
        return nil
    }

    /// Inside a folder called Chill, the playlist "Chill / Night" reads "Night".
    static func shownName(_ playlist: Playlist, chain: [String]) -> String {
        guard !chain.isEmpty else { return playlist.name.components(separatedBy: separator).last ?? playlist.name }
        let prefix = chain.joined(separator: separator) + separator
        return playlist.name.hasPrefix(prefix) && playlist.name.count > prefix.count ? String(playlist.name.dropFirst(prefix.count)) : playlist.name
    }

    /// Only these playlists, and no folder left empty by that.
    func keeping(_ included: (Playlist) -> Bool) -> FolderNode {
        var node = self
        node.playlists = playlists.filter(included)
        node.folders = folders.map { $0.keeping(included) }.filter { !$0.allPlaylists.isEmpty }
        return node
    }
}

enum PlaylistSort: String, CaseIterable {
    case title, updated, added, size

    var label: String {
        switch self {
        case .title: return "Title"
        case .updated: return "Recently Updated"
        case .added: return "Recently Added"
        case .size: return "Most Songs"
        }
    }

    func sorted(_ playlists: [Playlist], name: (Playlist) -> String) -> [Playlist] {
        playlists.sorted { a, b in
            let byName = name(a).localizedStandardCompare(name(b)) == .orderedAscending
            switch self {
            case .title: return byName
            // The server's stamps are ISO 8601, so they sort as text.
            case .updated: return a.changed == b.changed ? byName : (a.changed ?? "") > (b.changed ?? "")
            case .added: return a.created == b.created ? byName : (a.created ?? "") > (b.created ?? "")
            case .size: return a.songCount == b.songCount ? byName : (a.songCount ?? 0) > (b.songCount ?? 0)
            }
        }
    }
}
