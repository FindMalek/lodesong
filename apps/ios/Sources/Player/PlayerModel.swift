import Foundation

/// What every screen uses to control playback. Does nothing until the engine lands (#673).
@MainActor
final class PlayerModel: ObservableObject {
    @Published private(set) var queue: [Song] = []
    @Published private(set) var index = 0
    @Published private(set) var isPlaying = false
    @Published private(set) var position: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0

    var current: Song? { queue.indices.contains(index) ? queue[index] : nil }

    func play(_ songs: [Song], at start: Int = 0) {}
    func shuffle(_ songs: [Song]) {}
    func playNext(_ song: Song) {}
    func addToQueue(_ song: Song) {}
    func jump(to index: Int) {}
    func toggle() {}
    func next() {}
    func previous() {}
    func seek(to seconds: TimeInterval) {}
}
