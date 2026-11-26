import Foundation

enum RepeatMode: String, CaseIterable {
    case off, all, one
}

/// The songs lined up and which one is current. Only these methods change the order, so a library sync never does.
struct PlayQueue: Equatable {
    private(set) var songs: [Song] = []
    private(set) var index = 0
    /// Shuffled queues level each song on its own instead of by album.
    private(set) var shuffled = false
    /// Song ids as they were before shuffling, to put what is still to come back in order.
    private(set) var order: [String]?

    var current: Song? { songs.indices.contains(index) ? songs[index] : nil }

    /// Whether playing `new` would throw away songs still to come.
    func wouldLose(_ new: [Song]) -> Bool {
        current != nil && index + 1 < songs.count && new.map(\.id) != songs.map(\.id)
    }

    /// Only the songs that can play, starting at the one asked for or the first after it that can.
    static func available(_ songs: [Song], start: Int, _ has: (String) -> Bool) -> (songs: [Song], start: Int) {
        let kept = songs.indices.filter { has(songs[$0].id) }
        return (kept.map { songs[$0] }, kept.firstIndex { $0 >= start } ?? 0)
    }

    /// Where playback goes when the current song ends by itself.
    func following(_ mode: RepeatMode) -> Int? {
        if mode == .one { return current == nil ? nil : index }
        if songs.indices.contains(index + 1) { return index + 1 }
        return mode == .all && !songs.isEmpty ? 0 : nil
    }

    init(songs: [Song] = [], index: Int = 0, shuffled: Bool = false, order: [String]? = nil) {
        self.order = order
        self.songs = songs
        self.index = songs.indices.contains(index) ? index : 0
        self.shuffled = shuffled
    }

    /// Every song exactly once, in a random order.
    static func shuffling(_ songs: [Song]) -> PlayQueue {
        PlayQueue(songs: songs.shuffled(), shuffled: true, order: songs.map(\.id))
    }

    mutating func insertNext(_ added: [Song]) {
        songs.insert(contentsOf: added, at: songs.isEmpty ? 0 : index + 1)
    }

    mutating func append(_ added: [Song]) {
        songs.append(contentsOf: added)
    }

    /// Same meaning as SwiftUI's `onMove`: `target` counts positions before anything is taken out.
    /// The song that is current stays current, wherever it ends up.
    mutating func move(from source: IndexSet, to target: Int) {
        let source = source.filteredIndexSet { songs.indices.contains($0) }
        guard !source.isEmpty, (0...songs.count).contains(target) else { return }
        var places = Array(songs.indices)
        let moved = source.map { places[$0] }
        for place in source.reversed() { places.remove(at: place) }
        places.insert(contentsOf: moved, at: target - source.count(in: 0..<target))
        songs = places.map { songs[$0] }
        index = places.firstIndex(of: index) ?? 0
    }

    /// True when the current song was among them: the one after it takes its place.
    @discardableResult
    mutating func remove(at offsets: IndexSet) -> Bool {
        let offsets = offsets.filteredIndexSet { songs.indices.contains($0) }
        let lostCurrent = offsets.contains(index)
        let before = offsets.count(in: 0..<index)
        for offset in offsets.reversed() { songs.remove(at: offset) }
        index = min(index - before, max(0, songs.count - 1))
        return lostCurrent
    }

    /// Only what is still to come changes; the current song and the history stay put.
    mutating func setShuffled(_ on: Bool) {
        guard on != shuffled else { return }
        shuffled = on
        let start = min(index + 1, songs.count)
        let rest = songs[start...]
        if on {
            order = songs.map(\.id)
            songs.replaceSubrange(start..., with: rest.shuffled())
        } else if let order {
            let rank = Dictionary(order.enumerated().map { ($0.element, $0.offset) }, uniquingKeysWith: { first, _ in first })
            // Songs queued since the shuffle have no place in the old order; they stay at the end as they are.
            let sorted = rest.enumerated().sorted {
                (rank[$0.element.id] ?? order.count, $0.offset) < (rank[$1.element.id] ?? order.count, $1.offset)
            }
            songs.replaceSubrange(start..., with: sorted.map(\.element))
            self.order = nil
        }
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
        var order: [String]?
    }

    private struct Spot: Codable {
        var index: Int
        var position: TimeInterval
    }

    private var lineFile: URL { folder.appendingPathComponent("playback-queue.json") }
    private var spotFile: URL { folder.appendingPathComponent("playback-position.json") }

    func save(queue: PlayQueue, account: String) {
        write(Line(account: account, songs: queue.songs, shuffled: queue.shuffled, order: queue.order), to: lineFile)
    }

    func save(index: Int, position: TimeInterval) {
        write(Spot(index: index, position: position), to: spotFile)
    }

    /// Nil when nothing was saved, or it was saved by another account.
    func load(account: String) -> Saved? {
        guard let line: Line = read(lineFile), line.account == account, !line.songs.isEmpty else { return nil }
        let spot: Spot? = read(spotFile)
        let queue = PlayQueue(songs: line.songs, index: spot?.index ?? 0, shuffled: line.shuffled, order: line.order)
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
