import Foundation

/// The songs lined up and which one is current. Only these methods change the order, so a library sync never does.
struct PlayQueue: Equatable {
    private(set) var songs: [Song] = []
    private(set) var index = 0
    /// Shuffled queues level each song on its own instead of by album.
    private(set) var shuffled = false

    var current: Song? { songs.indices.contains(index) ? songs[index] : nil }
    var upcoming: Song? { songs.indices.contains(index + 1) ? songs[index + 1] : nil }

    init(songs: [Song] = [], index: Int = 0, shuffled: Bool = false) {
        self.songs = songs
        self.index = songs.indices.contains(index) ? index : 0
        self.shuffled = shuffled
    }

    /// Every song exactly once, in a random order.
    static func shuffling(_ songs: [Song]) -> PlayQueue {
        PlayQueue(songs: songs.shuffled(), shuffled: true)
    }

    mutating func insertNext(_ song: Song) {
        songs.insert(song, at: songs.isEmpty ? 0 : index + 1)
    }

    mutating func append(_ song: Song) {
        songs.append(song)
    }

    @discardableResult
    mutating func jump(to target: Int) -> Bool {
        guard songs.indices.contains(target) else { return false }
        index = target
        return true
    }
}

/// The queue and the position in it, kept across app restarts. The queue is written only when it changes,
/// the small position file every few seconds.
struct PlaybackStore {
    struct Saved: Equatable {
        var queue: PlayQueue
        var position: TimeInterval
    }

    let folder: URL

    private struct Line: Codable {
        var account: String
        var songs: [Song]
        var shuffled: Bool
    }

    private struct Spot: Codable {
        var index: Int
        var position: TimeInterval
    }

    private var lineFile: URL { folder.appendingPathComponent("playback-queue.json") }
    private var spotFile: URL { folder.appendingPathComponent("playback-position.json") }

    func save(queue: PlayQueue, account: String) {
        write(Line(account: account, songs: queue.songs, shuffled: queue.shuffled), to: lineFile)
    }

    func save(index: Int, position: TimeInterval) {
        write(Spot(index: index, position: position), to: spotFile)
    }

    /// Nil when nothing was saved, or it was saved by another account.
    func load(account: String) -> Saved? {
        guard let line: Line = read(lineFile), line.account == account, !line.songs.isEmpty else { return nil }
        let spot: Spot? = read(spotFile)
        let queue = PlayQueue(songs: line.songs, index: spot?.index ?? 0, shuffled: line.shuffled)
        return Saved(queue: queue, position: queue.index == spot?.index ? spot?.position ?? 0 : 0)
    }

    func clear() {
        try? FileManager.default.removeItem(at: lineFile)
        try? FileManager.default.removeItem(at: spotFile)
    }

    // Readable after the first unlock, or a locked phone would stop saving the position.
    private func write<Value: Encodable>(_ value: Value, to file: URL) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        #if os(iOS)
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try? data.write(to: file, options: .atomic)
        #endif
    }

    private func read<Value: Decodable>(_ file: URL) -> Value? {
        (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(Value.self, from: $0) }
    }
}
