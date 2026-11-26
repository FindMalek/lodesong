import Foundation

struct Starred: Decodable {
    var song: [Song]?
    var album: [Album]?
    var artist: [Artist]?
}

private struct HomeAnswer: Decodable {
    struct Body: Decodable {
        struct Albums: Decodable { var album: [Album]? }
        struct Songs: Decodable { var song: [Song]? }

        let status: String
        var albumList2: Albums?
        var starred2: Starred?
        var randomSongs: Songs?
    }

    let body: Body
    enum CodingKeys: String, CodingKey { case body = "subsonic-response" }
}

/// A stored song may lack fields this app needs; skip it instead of losing the whole list.
private struct Lossy<Value: Decodable>: Decodable {
    let value: Value?
    init(from decoder: Decoder) throws { value = try? Value(from: decoder) }
}

extension ServerClient {
    func albums(_ type: String, size: Int = 30) async throws -> [Album] {
        try await homeBody("getAlbumList2", ["type": type, "size": String(size)]).albumList2?.album ?? []
    }

    func randomSongs(size: Int = 30) async throws -> [Song] {
        try await homeBody("getRandomSongs", ["size": String(size)]).randomSongs?.song ?? []
    }

    func starred() async throws -> Starred {
        try await homeBody("getStarred2").starred2 ?? Starred()
    }

    /// Most played over the last year, from lodesong's own history.
    func topSongs(now: Date) async throws -> [Song] {
        struct Stats: Decodable {
            struct Top: Decodable {
                struct Item: Decodable { var song: Lossy<Song>? }
                let songs: [Item]
            }
            let top: Top
        }
        let to = Int(now.timeIntervalSince1970 * 1000)
        let query = ["from": String(to - 365 * 86_400_000), "to": String(to), "tz": String(TimeZone.current.secondsFromGMT(for: now) / 60)]
        let stats: Stats = try await homeAnswer("api/stats", query)
        return stats.top.songs.compactMap { $0.song?.value }
    }

    /// Newest first, skips included, as the web's history page lists them.
    func playedSongs(limit: Int = 100) async throws -> [Song] {
        struct History: Decodable {
            struct Play: Decodable { let song: Lossy<Song> }
            let plays: [Play]
        }
        let history: History = try await homeAnswer("api/history", ["limit": String(limit)])
        return history.plays.compactMap(\.song.value)
    }

    private func homeBody(_ endpoint: String, _ query: [String: String] = [:]) async throws -> HomeAnswer.Body {
        let answer: HomeAnswer = try await homeAnswer("rest/\(endpoint)", query.merging(["f": "json"]) { first, _ in first })
        guard answer.body.status == "ok" else { throw ServerError.message("The server refused \(endpoint).") }
        return answer.body
    }

    private func homeAnswer<Answer: Decodable>(_ path: String, _ query: [String: String]) async throws -> Answer {
        let (data, status) = try await send(URLRequest(url: url(path, query)))
        if status == 401 { throw ServerError.signedOut }
        guard status == 200 else { throw ServerError.message("The server answered \(status).") }
        return try JSONDecoder().decode(Answer.self, from: data)
    }
}
