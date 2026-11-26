import Foundation

enum Radio {
    /// The first `count` songs of `candidates` that aren't in `excluding`, each once.
    static func pick(_ candidates: [Song], excluding: Set<String>, count: Int) -> [Song] {
        var seen = excluding
        return Array(candidates.filter { seen.insert($0.id).inserted }.prefix(count))
    }
}

extension ServerClient {
    private struct Mix: Decodable {
        struct Body: Decodable {
            struct List: Decodable { var song: [Song]? }
            var similarSongs2: List?
            var topSongs: List?
            var randomSongs: List?
        }
        let body: Body
        enum CodingKeys: String, CodingKey { case body = "subsonic-response" }
    }

    private struct Bans: Decodable { let songs: [Song] }

    private func mix(_ endpoint: String, _ fields: [(String, String)]) async -> Mix.Body? {
        guard let data = try? await post(rest: endpoint, fields) else { return nil }
        return try? JSONDecoder().decode(Mix.self, from: data).body
    }

    /// Songs the account asked no radio to play.
    private func bannedSongs() async -> [String] {
        guard let (data, status) = try? await send(URLRequest(url: url("api/radio/bans"))), status == 200 else { return [] }
        return (try? JSONDecoder().decode(Bans.self, from: data))?.songs.map(\.id) ?? []
    }

    /// Songs like `seed`: its artist's similar and top songs, then others of its genre if those run short.
    /// Empty when there is nothing new to give or the server can't be reached.
    func radio(from seed: Song, excluding: Set<String>, count: Int) async -> [Song] {
        let excluding = excluding.union(await bannedSongs())
        var near: [Song] = []
        if let artist = seed.artistId {
            near += await mix("getSimilarSongs2", [("id", artist), ("count", "50")])?.similarSongs2?.song ?? []
        }
        if let artist = seed.artist {
            near += await mix("getTopSongs", [("artist", artist), ("count", "20")])?.topSongs?.song ?? []
        }
        let picked = Radio.pick(near.shuffled(), excluding: excluding, count: count)
        guard picked.count < count, let genre = seed.genre else { return picked }
        let others = await mix("getRandomSongs", [("size", "50"), ("genre", genre)])?.randomSongs?.song ?? []
        return picked + Radio.pick(others, excluding: excluding.union(picked.map(\.id)), count: count - picked.count)
    }
}
