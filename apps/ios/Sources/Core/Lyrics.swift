import Foundation

/// What `/api/lyrics/:songId` answers (packages/shared/src/lyrics.ts). Times are milliseconds.
struct Lyrics: Codable, Equatable {
    enum Status: String, Codable { case synced, plain, instrumental, missing }

    struct Word: Codable, Equatable {
        let start: Double
        let text: String
    }

    struct Line: Codable, Equatable {
        let start: Double
        let text: String
        var words: [Word]?
    }

    let status: Status
    var lines: [Line] = []

    /// The line being sung. `nudge` is the listener's own correction: positive shows lines later.
    func line(at ms: Double, nudge: Int = 0) -> Int? {
        guard status == .synced else { return nil }
        return lines.lastIndex { $0.start + Double(nudge) <= ms }
    }
}

extension Lyrics.Line {
    /// How many of this line's words have started.
    func sung(at ms: Double, nudge: Int = 0) -> Int {
        words?.prefix { $0.start + Double(nudge) <= ms }.count ?? 0
    }
}

struct SavedLyrics: Codable {
    var lyrics: Lyrics
    var nudge = 0
    /// Changed on the phone and not on the server yet.
    var nudgePending = false
    var fetched = Date()
}

/// One file per song, in a folder per account, so lyrics are there with no network.
final class LyricsStore: @unchecked Sendable {
    private let root: URL
    private let lock = NSLock()

    init(root: URL) {
        self.root = root
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    func load(_ song: String) -> SavedLyrics? {
        lock.lock()
        defer { lock.unlock() }
        return read(file(song))
    }

    /// A "missing" answer never replaces lyrics already here: the server says that when it can't reach its sources.
    @discardableResult
    func save(_ lyrics: Lyrics, song: String, now: Date = Date()) -> SavedLyrics {
        update(song) { old in
            var next = old ?? SavedLyrics(lyrics: lyrics)
            if lyrics.status != .missing || next.lyrics.status == .missing { next.lyrics = lyrics }
            next.fetched = now
            return next
        }!
    }

    @discardableResult
    func setNudge(_ nudge: Int, song: String, pending: Bool) -> SavedLyrics? {
        update(song) { old in
            var next = old
            next?.nudge = nudge
            next?.nudgePending = pending
            return next
        }
    }

    /// Never asked, or nothing was found a day or more ago.
    func wants(_ song: String, now: Date = Date()) -> Bool {
        guard let saved = load(song) else { return true }
        return saved.lyrics.status == .missing && now.timeIntervalSince(saved.fetched) > 86_400
    }

    func all() -> [String: Lyrics] {
        lock.lock()
        defer { lock.unlock() }
        let files = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        var found: [String: Lyrics] = [:]
        for url in files {
            guard let id = url.lastPathComponent.removingPercentEncoding, let saved = read(url), !saved.lyrics.lines.isEmpty else { continue }
            found[id] = saved.lyrics
        }
        return found
    }

    private func update(_ song: String, _ change: (SavedLyrics?) -> SavedLyrics?) -> SavedLyrics? {
        lock.lock()
        defer { lock.unlock() }
        let url = file(song)
        guard let next = change(read(url)) else { return nil }
        try? JSONEncoder().encode(next).write(to: url, options: .atomic)
        return next
    }

    private func read(_ url: URL) -> SavedLyrics? {
        (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(SavedLyrics.self, from: $0) }
    }

    private func file(_ song: String) -> URL {
        root.appendingPathComponent(song.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? song)
    }
}

/// A song found by its words, on the phone or by the server.
struct LyricsHit: Equatable {
    let song: Song
    /// Where the line starts (ms); nil for lyrics without timing.
    let start: Double?
    let text: String
}

/// The lodesong endpoints the web player uses for lyrics (docs/lyrics.md).
extension ServerClient {
    func lyrics(song id: String) async throws -> Lyrics {
        try await api("api/lyrics/\(id)")
    }

    func lyricsNudge(song id: String) async throws -> Int {
        struct Answer: Decodable { let offset: Double }
        let answer: Answer = try await api("api/lyrics/\(id)/offset")
        return Int(answer.offset)
    }

    func setLyricsNudge(_ nudge: Int, song id: String) async -> Bool {
        var request = apiRequest(url("api/lyrics/\(id)/offset"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try? JSONEncoder().encode(["offset": nudge])
        let response = try? await session.data(for: request).1
        return (response as? HTTPURLResponse)?.statusCode == 200
    }

    /// Searches the lyrics of the whole library, including songs this phone never saw the words of.
    func searchLyrics(_ query: String) async throws -> [LyricsHit] {
        struct Answer: Decodable {
            struct Hit: Decodable {
                let song: Song
                let start: Double?
                let text: String
            }
            let hits: [Hit]
        }
        let answer: Answer = try await api("api/search/lyrics", ["q": query])
        return answer.hits.map { LyricsHit(song: $0.song, start: $0.start, text: $0.text) }
    }

    private func apiRequest(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue("1", forHTTPHeaderField: "x-lodesong")
        request.timeoutInterval = 20
        return request
    }

    private func api<Answer: Decodable>(_ path: String, _ query: [String: String] = [:]) async throws -> Answer {
        let (data, response) = try await session.data(for: apiRequest(url(path, query)))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw ServerError.message("The server answered \(status).") }
        return try JSONDecoder().decode(Answer.self, from: data)
    }
}
