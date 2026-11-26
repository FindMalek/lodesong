import Foundation
import XCTest
@testable import LodesongCore

final class LyricsTests: XCTestCase {
    func testTheNudgeMovesWhichLineAndWordAreBeingSung() throws {
        let json = #"{"status":"synced","offset":0,"source":"lrclib","lines":[{"start":1000,"end":4000,"text":"one two","words":[{"start":1000,"text":"one"},{"start":2000,"text":"two"}]},{"start":4000,"end":9000,"text":"three"}]}"#
        let lyrics = try JSONDecoder().decode(Lyrics.self, from: Data(json.utf8))
        XCTAssertNil(lyrics.line(at: 500))
        XCTAssertEqual(lyrics.line(at: 4000), 1)
        XCTAssertEqual(lyrics.line(at: 4000, nudge: 250), 0)
        XCTAssertEqual(lyrics.lines[0].sung(at: 2100), 2)
        XCTAssertEqual(lyrics.lines[0].sung(at: 2100, nudge: 250), 1)
    }

    func testTranslationsDirectionAndTheSource() throws {
        let json = #"{"status":"plain","source":"navidrome","lines":[{"start":0,"text":"שלום"}],"translations":[{"lang":"eng","lines":["peace"]},{"lang":"fra","lines":["paix"]}]}"#
        let lyrics = try JSONDecoder().decode(Lyrics.self, from: Data(json.utf8))
        XCTAssertEqual(lyrics.translation("")?.lang, "eng")
        XCTAssertEqual(lyrics.translation("fra")?.lines, ["paix"])
        XCTAssertNil(lyrics.translation("off"))
        XCTAssertTrue(Lyrics.isRightToLeft("♪ שלום"))
        XCTAssertTrue(Lyrics.isRightToLeft("مرحبا"))
        XCTAssertFalse(Lyrics.isRightToLeft("1999 hello مرحبا"))
        XCTAssertTrue(lyrics.allowed(filesOnly: true))
        XCTAssertFalse(Lyrics(status: .synced, source: "lrclib").allowed(filesOnly: true))
    }

    func testSavedLyricsSurviveARestartAndAMissingAnswer() {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let found = Lyrics(status: .plain, lines: [.init(start: 0, text: "words")])
        let store = LyricsStore(root: folder)
        store.save(found, song: "a/1")
        store.setNudge(-250, song: "a/1", pending: true)
        store.save(Lyrics(status: .missing), song: "a/1")
        let reopened = LyricsStore(root: folder)
        XCTAssertEqual(reopened.load("a/1")?.lyrics, found)
        XCTAssertEqual(reopened.load("a/1")?.nudge, -250)
        XCTAssertEqual(reopened.all(), ["a/1": found])
        XCTAssertFalse(reopened.wants("a/1"))
        XCTAssertTrue(reopened.wants("b"))
    }
}
