import Foundation

extension ServerClient {
    /// lodesong's own API: the same cookie and header as Subsonic, plain JSON back.
    func data(api path: String, _ query: [String: String] = [:]) async throws -> Data {
        let (data, status) = try await send(URLRequest(url: url("api/\(path)", query)))
        if status == 401 { throw ServerError.signedOut }
        guard status == 200 else { throw ServerError.message("The server answered \(status).") }
        return data
    }

    func api<Answer: Decodable>(_ path: String, _ query: [String: String] = [:]) async throws -> Answer {
        try JSONDecoder().decode(Answer.self, from: try await data(api: path, query))
    }
}

/// Playlist folders and cover pictures, kept on the phone. A server that can't answer leaves the last copy.
enum ShelfSync {
    static let pictures = URL.applicationSupportDirectory.appending(path: "Pictures")

    /// Where the picture with this version lives; the version is a hash of the picture.
    static func file(_ version: String, in folder: URL = pictures) -> URL {
        folder.appending(path: version.filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
    }

    private struct Folders: Decodable {
        let folders: [PlaylistFolder]
        let items: [FolderItem]
    }

    private struct Covers: Decodable { let covers: [CoverChoice] }

    static func run(client: ServerClient, store: LibraryStore, pictures: URL) async {
        if let answer: Folders = try? await client.api("folders"), !Task.isCancelled {
            try? store.save("folder", answer.folders)
            try? store.save("folderItem", answer.items)
        }
        if let answer: Covers = try? await client.api("playlists/covers"), !Task.isCancelled {
            try? store.save("playlistCover", answer.covers)
        }
        let shelf = store.shelf()
        var wanted: [(path: String, version: String)] = shelf.folders.compactMap { folder in folder.coverVersion.map { ("folders/\(folder.id)/cover", $0) } }
        wanted += shelf.covers.filter { $0.kind == "image" }.map { ("playlists/\($0.playlistId)/cover", $0.version) }

        try? FileManager.default.createDirectory(at: pictures, withIntermediateDirectories: true)
        for picture in wanted {
            let file = file(picture.version, in: pictures)
            if FileManager.default.fileExists(atPath: file.path) || Task.isCancelled { continue }
            if let data = try? await client.data(api: picture.path, ["v": picture.version]) { try? data.write(to: file, options: .atomic) }
        }
        let keep = Set(wanted.map { file($0.version, in: pictures).lastPathComponent })
        for name in (try? FileManager.default.contentsOfDirectory(atPath: pictures.path)) ?? [] where !keep.contains(name) {
            try? FileManager.default.removeItem(at: pictures.appending(path: name))
        }
    }
}

extension LibraryStore {
    func shelf() -> PlaylistShelf {
        PlaylistShelf(folders: load("folder"), items: load("folderItem"), covers: load("playlistCover"))
    }
}
