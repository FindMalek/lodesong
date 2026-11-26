import XCTest
@testable import LodesongCore

final class DeviceTests: XCTestCase {
    private let mac = Device(id: "mac", name: "the desktop app", active: true)
    private let phone = Device(id: "phone", name: "the iphone app", active: false)
    private let start = Date(timeIntervalSince1970: 1000)
    private let playing = DeviceState(songs: [Song(id: "s1", title: "One", duration: 100)], position: 10, playing: true)

    func testTheDeviceThatDisappearsLeavesItsSongHerePaused() {
        var mirror = DeviceMirror()
        XCTAssertNil(mirror.list([mac, phone], me: "phone", playingHere: false, now: start))
        XCTAssertEqual(mirror.playingOn, mac)
        mirror.heard(playing, now: start)
        XCTAssertEqual(mirror.position(at: start + 5), 15)
        XCTAssertEqual(mirror.position(at: start + 500), 100)

        // The server lists nothing as active; a dropped socket lists nothing at all.
        let left = mirror.list([phone], me: "phone", playingHere: false, now: start + 20)
        XCTAssertNil(mirror.playingOn)
        XCTAssertEqual(left?.position, 30)
        XCTAssertEqual(left?.playing, false)
    }

    func testNotARemoteWhilePlayingHereOrOnceMovedHere() {
        var mirror = DeviceMirror()
        _ = mirror.list([mac, phone], me: "phone", playingHere: true)
        XCTAssertNil(mirror.playingOn)

        _ = mirror.list([mac, phone], me: "phone", playingHere: false)
        mirror.heard(playing)
        // `take` brings the state, so nothing is kept from here.
        XCTAssertNil(mirror.list([Device(id: "phone", name: "", active: true)], me: "phone", playingHere: false))
        XCTAssertNil(mirror.playingOn)
    }

    func testTheOwnQueueIsNeverReplacedUnasked() {
        let one = Song(id: "s1", title: "One"), other = Song(id: "x", title: "Mine")
        XCTAssertEqual(playing.leftover(upcoming: [other]), .offer)
        XCTAssertEqual(playing.leftover(upcoming: [one]), .spot)
        XCTAssertEqual(playing.leftover(upcoming: []), .take)
    }

    func testAPausedQueueNeverPublishedClaimsTheSessionBeforeMoving() {
        var paused = playing
        paused.playing = false
        XCTAssertEqual(DeviceRequest.handOver(paused, to: "mac", claim: true), [.state(playing), .state(paused), .transfer(to: "mac")])
        XCTAssertEqual(DeviceRequest.handOver(paused, to: "mac", claim: false), [.state(paused), .transfer(to: "mac")])
    }

    func testALongListIsCutAroundTheSongAskedFor() throws {
        let songs = (0..<900).map { Song(id: "s\($0)", title: "Song", playCount: 3) }
        let text = try XCTUnwrap(DeviceRequest.command(.play(songs, start: 600, shuffle: false)).text)
        let sent = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])
        let command = try XCTUnwrap(sent["command"] as? [String: Any])
        let list = try XCTUnwrap(command["songs"] as? [[String: Any]])
        XCTAssertEqual(list.count, DeviceCommand.maxSongs)
        XCTAssertEqual(list[try XCTUnwrap(command["start"] as? Int)]["id"] as? String, "s600")
        XCTAssertNil(list[0]["playCount"])
    }
}
