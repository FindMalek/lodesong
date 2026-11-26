import Foundation
import XCTest
@testable import LodesongCore

final class PlaybackTests: XCTestCase {
    private func songs(_ ids: String...) -> [Song] { ids.map { Song(id: $0, title: $0) } }

    func testPlayNextGoesRightAfterTheCurrentSongAndAddGoesLast() {
        var queue = PlayQueue(songs: songs("a", "b", "c"), index: 1)
        queue.insertNext(Song(id: "next", title: "next"))
        queue.append(Song(id: "last", title: "last"))
        XCTAssertEqual(queue.songs.map(\.id), ["a", "b", "next", "c", "last"])
        XCTAssertEqual(queue.current?.id, "b")
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

    func testAFormatIOSCannotPlayIsTranscodedAndAFailedSourceFallsBack() {
        XCTAssertEqual(AudioSource.pick(suffix: "opus", hasFile: false, failed: []), .original)
        XCTAssertEqual(AudioSource.pick(suffix: "wma", hasFile: false, failed: []), .transcoded)
        XCTAssertEqual(AudioSource.pick(suffix: "ogg", hasFile: true, failed: [.file, .original]), .transcoded)
        XCTAssertNil(AudioSource.pick(suffix: "mp3", hasFile: false, failed: [.original, .transcoded]))
    }
}
