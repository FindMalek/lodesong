import Foundation

enum ServerError: LocalizedError, Equatable {
    case signedOut
    case message(String)

    var errorDescription: String? {
        switch self {
        case .signedOut: return "Your sign in expired. Sign in again."
        case .message(let text): return text
        }
    }
}

/// Talks to a lodesong server the way the web player does: a session cookie from `/auth/login`, then Subsonic under `/rest`.
struct ServerClient {
    let server: URL
    var session: URLSession = .shared

    /// "music.example.com" becomes https; an address on your own network (an IP, a port, `.local`) stays http.
    static func normalize(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") {
            let local = text.hasSuffix(".local") || text.contains(":") || text.range(of: #"^\d{1,3}(\.\d{1,3}){3}"#, options: .regularExpression) != nil
            text = (local ? "http://" : "https://") + text
        }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), let host = url.host, !host.isEmpty, url.scheme == "http" || url.scheme == "https" else { return nil }
        return url
    }

    func url(_ path: String, _ query: [String: String] = [:]) -> URL {
        var parts = URLComponents(url: server.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        return parts.url!
    }

    func coverURL(_ id: String, size: Int) -> URL {
        url("rest/getCoverArt", ["id": id, "size": String(size)])
    }

    func signIn(user: String, password: String) async throws {
        var request = URLRequest(url: url("auth/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(["user": user, "password": password])
        let (data, status) = try await send(request)
        // A web page that answers 200 to anything must not count: signing in somewhere new replaces the library.
        if status == 200, (try? JSONDecoder().decode(SignedIn.self, from: data)) != nil { return }
        if status == 200 { throw ServerError.message("That address isn't a lodesong server.") }
        let reason = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
        throw ServerError.message(reason ?? "The server answered \(status).")
    }

    /// Best effort: signing out must work with no network too.
    func signOut() async {
        var request = URLRequest(url: url("auth/logout"))
        request.httpMethod = "POST"
        request.timeoutInterval = 5
        _ = try? await send(request)
    }

    private struct SignedIn: Decodable { let user: String }

    func librarySnapshot(knownPlaylists: [String: String]) async throws -> LibrarySnapshot {
        var snapshot = LibrarySnapshot()
        snapshot.artists = try await all("artist") { $0.searchResult3?.artist }
        snapshot.albums = try await all("album") { $0.searchResult3?.album }
        snapshot.songs = try await all("song") { $0.searchResult3?.song }
        snapshot.playlists = try await rest("getPlaylists").playlists?.playlist ?? []
        for playlist in snapshot.playlists where playlist.changed == nil || knownPlaylists[playlist.id] != playlist.changed
            || playlist.readonly == true || playlist.validUntil != nil {
            snapshot.entries[playlist.id] = try await rest("getPlaylist", ["id": playlist.id]).playlist?.entry ?? []
        }
        return snapshot
    }

    /// Navidrome answers an empty `search3` with everything, a page at a time.
    private func all<Item>(_ kind: String, _ pick: (Body) -> [Item]?) async throws -> [Item] {
        let page = 500
        var items: [Item] = []
        while true {
            var query = ["query": "", "artistCount": "0", "albumCount": "0", "songCount": "0"]
            query["\(kind)Count"] = String(page)
            query["\(kind)Offset"] = String(items.count)
            let batch = pick(try await rest("search3", query)) ?? []
            items += batch
            if batch.count < page { return items }
        }
    }

    private struct Envelope: Decodable {
        let body: Body
        enum CodingKeys: String, CodingKey { case body = "subsonic-response" }
    }

    private struct Body: Decodable {
        struct Failure: Decodable { let message: String? }
        struct Search: Decodable {
            var artist: [Artist]?
            var album: [Album]?
            var song: [Song]?
        }
        struct Playlists: Decodable { var playlist: [Playlist]? }
        struct Entries: Decodable { var entry: [Song]? }

        let status: String
        var error: Failure?
        var searchResult3: Search?
        var playlists: Playlists?
        var playlist: Entries?
    }

    private func rest(_ endpoint: String, _ query: [String: String] = [:]) async throws -> Body {
        let (data, status) = try await send(URLRequest(url: url("rest/\(endpoint)", query.merging(["f": "json"]) { first, _ in first })))
        if status == 401 { throw ServerError.signedOut }
        guard status == 200 else { throw ServerError.message("The server answered \(status).") }
        let body = try JSONDecoder().decode(Envelope.self, from: data).body
        guard body.status == "ok" else { throw ServerError.message(body.error?.message ?? "The server refused \(endpoint).") }
        return body
    }

    private func send(_ request: URLRequest) async throws -> (Data, Int) {
        var request = request
        request.setValue("1", forHTTPHeaderField: "x-lodesong")
        let (data, response) = try await session.data(for: request)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
}
