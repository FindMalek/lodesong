import Foundation

/// A play queue some Subsonic client saved on the server.
struct RemoteQueue: Equatable {
    var songs: [Song]
    var index: Int
    var position: TimeInterval
    var changed: String
    var changedBy: String

    var date: Date? {
        // Servers send up to nanoseconds, which the parser refuses.
        ISO8601DateFormatter().date(from: changed.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression))
    }
}

/// Scrobbles and the shared play queue, the same calls the web player makes (docs/sync.md).
extension ServerClient {
    func scrobble(song id: String, submission: Bool, client: String) async {
        let query = ["id": id, "submission": String(submission), "time": String(Int(Date().timeIntervalSince1970 * 1000)), "f": "json"]
        _ = try? await session.data(for: request(url("rest/scrobble", query), client: client))
    }

    /// The current song goes first, then what follows it. A form POST, so a long queue has no URL limit.
    func savePlayQueue(_ ids: [String], position: TimeInterval, client: String) async -> Bool {
        guard let first = ids.first else { return false }
        let indexed = await indexBasedQueue(client: client)
        var fields = ids.map { ("id", $0) }
        fields.append(indexed ? ("currentIndex", "0") : ("current", first))
        fields.append(("position", String(Int(position * 1000))))
        fields.append(("f", "json"))
        var request = request(url(indexed ? "rest/savePlayQueueByIndex" : "rest/savePlayQueue"), client: client)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "content-type")
        let safe = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        request.httpBody = Data(fields.map { "\($0.0)=\($0.1.addingPercentEncoding(withAllowedCharacters: safe) ?? "")" }.joined(separator: "&").utf8)
        let response = try? await session.data(for: request).1
        return (response as? HTTPURLResponse)?.statusCode == 200
    }

    func savedPlayQueue(client: String) async -> RemoteQueue? {
        let indexed = await indexBasedQueue(client: client)
        let body = await reply(indexed ? "getPlayQueueByIndex" : "getPlayQueue", client: client)
        guard let saved = indexed ? body?.playQueueByIndex : body?.playQueue, let songs = saved.entry, !songs.isEmpty else { return nil }
        let index = saved.currentIndex ?? songs.firstIndex { $0.id == saved.current } ?? 0
        return RemoteQueue(songs: songs, index: songs.indices.contains(index) ? index : 0, position: Double(saved.position ?? 0) / 1000,
                           changed: saved.changed ?? "", changedBy: saved.changedBy ?? "")
    }

    private func indexBasedQueue(client: String) async -> Bool {
        await reply("getOpenSubsonicExtensions", client: client)?.openSubsonicExtensions?.contains { $0.name == "indexBasedQueue" } ?? false
    }

    private struct Reply: Decodable {
        struct Body: Decodable {
            struct Extension: Decodable { let name: String }
            struct Queue: Decodable {
                var entry: [Song]?
                var current: String?
                var currentIndex: Int?
                var position: Int?
                var changed: String?
                var changedBy: String?
            }

            var openSubsonicExtensions: [Extension]?
            var playQueue: Queue?
            var playQueueByIndex: Queue?
        }

        let body: Body
        enum CodingKeys: String, CodingKey { case body = "subsonic-response" }
    }

    private func reply(_ endpoint: String, client: String) async -> Reply.Body? {
        guard let (data, _) = try? await session.data(for: request(url("rest/\(endpoint)", ["f": "json"]), client: client)) else { return nil }
        return try? JSONDecoder().decode(Reply.self, from: data).body
    }

    /// `x-keep-client` makes the server name this phone `lodesong@<client>`, as it does each browser.
    private func request(_ url: URL, client: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue("1", forHTTPHeaderField: "x-lodesong")
        request.setValue(client, forHTTPHeaderField: "x-keep-client")
        return request
    }
}
