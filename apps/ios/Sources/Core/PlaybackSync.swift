import Foundation

/// A play queue some Subsonic client saved on the server.
struct RemoteQueue: Equatable {
    var songs: [Song]
    var index: Int
    var position: TimeInterval
    var changed: String
    var changedBy: String

    var date: Date? { serverDate(changed) }
}

func serverDate(_ text: String) -> Date? {
    // Servers send up to nanoseconds, which the parser refuses.
    ISO8601DateFormatter().date(from: text.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression))
}

/// What a saved queue holds. The phone only saves when this differs from what it last saved, restored or took
/// over, so just opening and leaving the app never replaces what another device saved since.
struct QueueMark: Equatable {
    let ids: [String]
    /// Milliseconds, whole seconds only.
    let position: Int

    init(_ queue: PlayQueue, position: TimeInterval) {
        ids = queue.songs.dropFirst(queue.index).prefix(1000).map(\.id)
        self.position = Int(position) * 1000
    }
}

/// Scrobbles and the shared play queue, the same calls the web player makes (docs/sync.md).
extension ServerClient {
    /// `time` is when the song started playing, in ms: a play sent later keeps its own time.
    @discardableResult
    func scrobble(song id: String, submission: Bool, time: Int = Int(Date().timeIntervalSince1970 * 1000), client: String) async -> Delivery {
        await deliver("scrobble", ["id": id, "submission": String(submission), "time": String(time)], client: client)
    }

    func setLiked(song id: String, _ liked: Bool, client: String) async -> Delivery {
        await deliver(liked ? "star" : "unstar", ["id": id], client: client)
    }

    /// Zero takes the rating away.
    func setRating(song id: String, _ stars: Int, client: String) async -> Delivery {
        await deliver("setRating", ["id": id, "rating": String(stars)], client: client)
    }

    private func deliver(_ endpoint: String, _ query: [String: String], client: String) async -> Delivery {
        let query = query.merging(["f": "json"]) { first, _ in first }
        guard let (data, response) = try? await session.data(for: request(url("rest/\(endpoint)", query), client: client)),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let body = try? JSONDecoder().decode(Reply.self, from: data).body else { return .later }
        if body.status == "ok" { return .done }
        // The song is gone from the server: asking again will never work.
        return body.error?.code == 70 ? .refused : .later
    }

    /// One play for lodesong's history. The server records a `key` once, so sending it again is safe.
    func addPlay(_ play: LoggedPlay, client: String) async -> Delivery {
        struct Body: Encodable {
            let song: Song
            let started: Int
            let listened: Double
            let finished: Bool
            let key: String
        }
        var request = request(url("api/history"), client: client)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try? JSONEncoder().encode(Body(song: play.song, started: play.started, listened: min(play.listened, 86_399),
                                                          finished: play.finished, key: play.key))
        let status = (try? await session.data(for: request).1 as? HTTPURLResponse)?.statusCode
        if status == 200 { return .done }
        return status == 400 || status == 413 || status == 422 ? .refused : .later
    }

    /// The current song goes first, then what follows it. A form POST, so a long queue has no URL limit.
    func savePlayQueue(_ mark: QueueMark, client: String) async -> Bool {
        let ids = mark.ids
        guard let first = ids.first else { return false }
        let indexed = await indexBasedQueue(client: client)
        var fields = ids.map { ("id", $0) }
        fields.append(indexed ? ("currentIndex", "0") : ("current", first))
        fields.append(("position", String(mark.position)))
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
            struct Failure: Decodable { let code: Int? }
            struct Extension: Decodable { let name: String }
            struct Queue: Decodable {
                var entry: [Song]?
                var current: String?
                var currentIndex: Int?
                var position: Int?
                var changed: String?
                var changedBy: String?
            }

            var status: String?
            var error: Failure?
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
        // These run in the little time iOS gives an app that is leaving; an unreachable server must not use it up.
        request.timeoutInterval = 8
        return request
    }
}
