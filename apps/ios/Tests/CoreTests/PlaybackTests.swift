import Foundation
import XCTest
@testable import LodesongCore

final class PlaybackTests: XCTestCase {
    private func songs(_ ids: String...) -> [Song] { ids.map { Song(id: $0, title: $0) } }

    func testPlayNextGoesRightAfterTheCurrentSongAndAddGoesLast() {
        var queue = PlayQueue(songs: songs("a", "b", "c"), index: 1)
        queue.insertNext(songs("next"))
        queue.append(songs("last"))
        XCTAssertEqual(queue.songs.map(\.id), ["a", "b", "next", "c", "last"])
        XCTAssertEqual(queue.current?.id, "b")
    }

    func testPlayNextOnAnEmptyQueueKeepsTheOrderGiven() {
        var queue = PlayQueue()
        queue.insertNext(songs("a", "b", "c"))
        XCTAssertEqual(queue.songs.map(\.id), ["a", "b", "c"])
        XCTAssertEqual(queue.current?.id, "a")
    }

    func testMovingAndRemovingKeepTheCurrentSongCurrent() {
        var queue = PlayQueue(songs: songs("a", "b", "c", "d"), index: 1)
        queue.move(from: [3], to: 0)
        XCTAssertEqual(queue.songs.map(\.id), ["d", "a", "b", "c"])
        XCTAssertEqual(queue.current?.id, "b")
        XCTAssertFalse(queue.remove(at: [0]))
        XCTAssertEqual(queue.current?.id, "b")
        XCTAssertTrue(queue.remove(at: [1]))
        XCTAssertEqual(queue.current?.id, "c")
    }

    func testTurningShuffleOffPutsWhatIsToComeBackInOrder() {
        let all = (0..<50).map { Song(id: "s\($0)", title: "\($0)") }
        var queue = PlayQueue(songs: all, index: 2)
        queue.setShuffled(true)
        XCTAssertEqual(Array(queue.songs.prefix(3)), Array(all.prefix(3)))
        XCTAssertNotEqual(queue.songs, all)
        queue.setShuffled(false)
        XCTAssertEqual(queue.songs, all)
    }

    func testRepeatDecidesWhatFollowsTheLastSong() {
        let queue = PlayQueue(songs: songs("a", "b"), index: 1)
        XCTAssertNil(queue.following(.off))
        XCTAssertEqual(queue.following(.all), 0)
        XCTAssertEqual(queue.following(.one), 1)
    }

    func testShuffleCoversEverySongOnce() {
        let all = (0..<500).map { Song(id: "s\($0)", title: "\($0)") }
        let queue = PlayQueue.shuffling(all)
        XCTAssertEqual(queue.songs.map(\.id).sorted(), all.map(\.id).sorted())
        XCTAssertNotEqual(queue.songs, all)
        XCTAssertEqual(queue.index, 0)
    }

    func testQueueAndPositionComeBackAfterARestartForTheSameAccountOnly() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let queue = PlayQueue(songs: songs("a", "b", "c"), index: 2, shuffled: true)
        PlaybackStore(folder: folder).save(queue: queue, account: "me")
        PlaybackStore(folder: folder).save(index: 2, position: 41.5)

        XCTAssertEqual(PlaybackStore(folder: folder).load(account: "me"), .init(queue: queue, position: 41.5))
        XCTAssertNil(PlaybackStore(folder: folder).load(account: "someone else"))
    }

    func testAQueueNobodyTouchedHereIsNotSavedOverAnotherDevices() {
        let queue = PlayQueue(songs: songs("a", "b"), index: 0)
        let saved = QueueMark(queue, position: 41.2)
        XCTAssertEqual(QueueMark(queue, position: 41.4), saved)
        XCTAssertNotEqual(QueueMark(queue, position: 60), saved)
        XCTAssertNotEqual(QueueMark(PlayQueue(songs: songs("a", "b"), index: 1), position: 41.2), saved)
    }

    func testAFormatIOSCannotPlayIsTranscodedAndAFailedSourceFallsBack() {
        XCTAssertEqual(AudioSource.pick(suffix: "opus", hasFile: false, failed: []), .original)
        XCTAssertEqual(AudioSource.pick(suffix: "wma", hasFile: false, failed: []), .transcoded)
        XCTAssertEqual(AudioSource.pick(suffix: "ogg", hasFile: true, failed: [.file, .original]), .transcoded)
        XCTAssertNil(AudioSource.pick(suffix: "mp3", hasFile: false, failed: [.original, .transcoded]))
    }
}
