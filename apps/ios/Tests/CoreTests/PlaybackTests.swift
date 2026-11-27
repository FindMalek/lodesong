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

    func testAStreamingLimitAsksForASmallerCopyButADownloadStillWins() {
        XCTAssertEqual(AudioSource.pick(suffix: "flac", hasFile: false, limited: true, failed: []), .transcoded)
        XCTAssertEqual(AudioSource.pick(suffix: "flac", hasFile: true, limited: true, failed: []), .file)
        XCTAssertEqual(AudioSource.pick(suffix: "flac", hasFile: false, limited: true, failed: [.transcoded]), .original)
    }

    func testAPlayCountsAtTheChosenShareOrTime() {
        XCTAssertFalse(Pref.pastScrobblePoint(100, duration: 200, percent: 75, minutes: 4))
        XCTAssertTrue(Pref.pastScrobblePoint(150, duration: 200, percent: 75, minutes: 4))
        XCTAssertTrue(Pref.pastScrobblePoint(120, duration: 1000, percent: 75, minutes: 2))
    }

    func testWithoutAMinimumTimeOnlyTheShareCounts() {
        XCTAssertFalse(Pref.pastScrobblePoint(500, duration: 1000, percent: 75, minutes: nil))
    }

    func testTheSleepTimerStopsAtTheEndOfTheAlbumOrTheQueue() {
        let songs = ["x", "x", "y"].enumerated().map { Song(id: "\($0.offset)", title: "", albumId: $0.element) }
        XCTAssertFalse(SleepTimer.endOfAlbum.stops(after: PlayQueue(songs: songs, index: 0)))
        XCTAssertTrue(SleepTimer.endOfAlbum.stops(after: PlayQueue(songs: songs, index: 1)))
        XCTAssertFalse(SleepTimer.endOfQueue.stops(after: PlayQueue(songs: songs, index: 1)))
        XCTAssertTrue(SleepTimer.endOfQueue.stops(after: PlayQueue(songs: songs, index: 2)))
    }

    func testRadioNeverRepeatsASong() {
        let picked = Radio.pick(songs("a", "b", "a", "c", "d"), excluding: ["b"], count: 2)
        XCTAssertEqual(picked.map(\.id), ["a", "c"])
    }

    func testSleepTimerButtonIsOffUntilAsked() {
        XCTAssertEqual(PlayerButton.shown(order: "queue", hidden: PlayerButton.hiddenByDefault), [.queue, .airplay, .settings, .dismiss, .lyrics])
    }

    func testTheDevicesButtonCannotBeHiddenWhileAnotherDevicePlays() {
        XCTAssertFalse(PlayerButton.shown(order: "", hidden: "airplay").contains(.airplay))
        XCTAssertTrue(PlayerButton.shown(order: "", hidden: "airplay", remote: true).contains(.airplay))
    }

    func testInfinitePlayAddsNothingOnceRepeatOrEndOfQueueIsPicked() {
        let queue = PlayQueue(songs: songs("a"))
        XCTAssertTrue(Radio.wantsMore(on: true, remote: false, repeatMode: .off, sleepTimer: nil, queue: queue))
        XCTAssertFalse(Radio.wantsMore(on: true, remote: false, repeatMode: .all, sleepTimer: nil, queue: queue))
        XCTAssertFalse(Radio.wantsMore(on: true, remote: false, repeatMode: .off, sleepTimer: .endOfQueue, queue: queue))
    }

    func testRadioFromTheSongThatIsOnKeepsItAndReplacesWhatFollows() {
        var queue = PlayQueue(songs: songs("a", "b", "c"), index: 1)
        queue.replaceUpcoming(songs("r"))
        XCTAssertEqual(queue.songs.map(\.id), ["a", "b", "r"])
        XCTAssertEqual(queue.current?.id, "b")
    }
}
