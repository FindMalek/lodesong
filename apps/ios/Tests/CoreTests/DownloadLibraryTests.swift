import Foundation
import XCTest
@testable import LodesongCore

final class DownloadLibraryTests: XCTestCase {
    private var root: URL!
    private var store: LibraryStore!
    private var downloads: DownloadLibrary!
    private let gym = DownloadRef(kind: .playlist, id: "gym")

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        store = try LibraryStore(path: ":memory:")
        downloads = DownloadLibrary(root: root)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    private func library(_ playlists: [String: [String]]) throws {
        let song = { (id: String) in Song(id: id, title: id, suffix: "mp3") }
        try store.apply(LibrarySnapshot(
            songs: Set(playlists.values.joined()).map(song),
            playlists: playlists.keys.sorted().map { Playlist(id: $0, name: $0) },
            entries: playlists.mapValues { $0.map(song) }
        ))
    }

    private func finish(_ id: String, _ body: Data = Data("ID3 pretend audio".utf8), status: Int = 200, format: String = "raw") -> Bool {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? body.write(to: file)
        return downloads.accept(song: id, file: file, status: status, requested: URL(string: "https://music.test/rest/stream?format=\(format)&id=\(id)")!)
    }

    /// A silent 8 kHz mono WAV.
    private func wav(seconds: Int) -> Data {
        func le(_ value: Int, _ bytes: Int) -> [UInt8] { (0..<bytes).map { UInt8(truncatingIfNeeded: value >> ($0 * 8)) } }
        let size = seconds * 16000
        var data = Data("RIFF".utf8) + le(36 + size, 4) + Data("WAVEfmt ".utf8)
        data += le(16, 4) + le(1, 2) + le(1, 2) + le(8000, 4) + le(16000, 4) + le(2, 2) + le(16, 2)
        data += Data("data".utf8) + le(size, 4)
        return data + Data(count: size)
    }

    private func keepOne(suffix: String, duration: Int? = nil) throws {
        let song = Song(id: "s1", title: "s1", duration: duration, suffix: suffix)
        try store.apply(LibrarySnapshot(songs: [song], playlists: [Playlist(id: "gym", name: "Gym")], entries: ["gym": [song]]))
        downloads.keep(gym, from: store)
    }

    func testATranscodedFLACIsSavedAsMP3() throws {
        try keepOne(suffix: "flac")
        XCTAssertTrue(finish("s1", format: "mp3"))
        XCTAssertEqual(downloads.localURL(song: "s1")?.pathExtension, "mp3")
    }

    func testATranscodeThatStoppedEarlyIsRefused() throws {
        try keepOne(suffix: "opus", duration: 60)
        XCTAssertFalse(finish("s1", wav(seconds: 5), format: "mp3"))
        XCTAssertNil(downloads.localURL(song: "s1"))
        XCTAssertTrue(finish("s1", wav(seconds: 60), format: "mp3"))
    }

    func testAnOriginalOggFileIsKeptOnlyWhenItHoldsOpus() throws {
        try keepOne(suffix: "opus")
        let ogg = { (codec: String) in Data("OggS".utf8) + Data(count: 24) + Data(codec.utf8) }
        XCTAssertFalse(finish("s1", ogg("\u{1}vorbis\0")))
        XCTAssertTrue(finish("s1", ogg("OpusHead")))
        XCTAssertEqual(downloads.localURL(song: "s1")?.pathExtension, "opus")
    }

    func testEachServerAndUserHasItsOwnFolder() {
        let folder = { DownloadLibrary.folder(server: URL(string: $0)!, user: $1) }
        XCTAssertEqual(folder("http://music.test", "demo"), folder("https://Music.test", "Demo"))
        XCTAssertNotEqual(folder("https://music.test", "demo"), folder("https://other.test", "demo"))
        XCTAssertNotEqual(folder("https://music.test", "demo"), folder("https://music.test", "kim"))
    }

    func testSongsAddedToAKeptPlaylistAreFetchedInItsOrder() throws {
        try library(["gym": ["s1"]])
        downloads.keep(gym, from: store)
        XCTAssertTrue(finish("s1"))

        try library(["gym": ["s3", "s1", "s2"]])
        downloads.reconcile(with: store)
        XCTAssertEqual(downloads.pending().map(\.id), ["s3", "s2"])
        XCTAssertEqual(downloads.collections[0].songs.map(\.id), ["s3", "s1", "s2"])
    }

    func testOnlySongsASyncAddedToAKeptPlaylistAreReported() throws {
        try library(["gym": ["s1", "s2"]])
        downloads.keep(gym, from: store)
        let before = downloads.collections

        try library(["gym": ["s2", "s3", "s1", "s4"], "run": ["s9"]])
        downloads.reconcile(with: store)
        XCTAssertEqual(NewTracks.found(before: before, after: downloads.collections), [NewTracks(playlist: "gym", name: "gym", count: 2)])
        XCTAssertEqual(NewTracks.found(before: downloads.collections, after: downloads.collections), [])
    }

    func testSongsRemovedFromAKeptPlaylistAreDeleted() throws {
        try library(["gym": ["s1", "s2"]])
        downloads.keep(gym, from: store)
        XCTAssertTrue(finish("s1"))
        XCTAssertTrue(finish("s2"))
        let removed = try XCTUnwrap(downloads.localURL(song: "s1"))

        try library(["gym": ["s2"]])
        downloads.reconcile(with: store)
        XCTAssertFalse(FileManager.default.fileExists(atPath: removed.path))
        XCTAssertNotNil(downloads.localURL(song: "s2"))
    }

    func testASongAnotherKeptPlaylistNeedsStays() throws {
        try library(["gym": ["s1"], "run": ["s1"]])
        downloads.keep(gym, from: store)
        downloads.keep(DownloadRef(kind: .playlist, id: "run"), from: store)
        XCTAssertTrue(finish("s1"))

        downloads.remove(gym)
        XCTAssertNotNil(downloads.localURL(song: "s1"))
    }

    func testAFailedSyncOrAVanishedLibraryKeepsFiles() async throws {
        try library(["gym": ["s1"]])
        downloads.keep(gym, from: store)
        XCTAssertTrue(finish("s1"))

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubServer.self]
        StubServer.answers = [:]
        let client = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        do {
            try await LibrarySync.run(client: client, store: store)
            XCTFail("sync should have failed")
        } catch {}
        downloads.reconcile(with: store)
        XCTAssertNotNil(downloads.localURL(song: "s1"))

        try store.clear()
        downloads.reconcile(with: store)
        try library(["other": ["s9"]])
        downloads.reconcile(with: store)
        // Listed with songs, but the songs were never stored.
        try store.apply(LibrarySnapshot(playlists: [Playlist(id: "gym", name: "gym", songCount: 1)], entries: ["gym": []]))
        downloads.reconcile(with: store)
        // A fresh instance reads the saved list, as after an app restart.
        XCTAssertNotNil(DownloadLibrary(root: root).localURL(song: "s1"))
    }

    func testAnErrorAnswerIsNeverSavedAsAudio() throws {
        try library(["gym": ["s1"]])
        downloads.keep(gym, from: store)

        XCTAssertFalse(finish("s1", Data("<!doctype html><title>502 Bad Gateway</title>".utf8)))
        XCTAssertFalse(finish("s1", Data(#"{"subsonic-response":{"status":"failed"}}"#.utf8)))
        XCTAssertFalse(finish("s1", status: 401))
        XCTAssertNil(downloads.localURL(song: "s1"))
        XCTAssertEqual(downloads.pending().map(\.id), ["s1"])
    }

    func testFormatsIOSCannotPlayAreAskedForAsMP3() {
        let client = ServerClient(server: URL(string: "https://music.test")!)
        let format = { (suffix: String) in
            DownloadLibrary.url(Song(id: "s", title: "s", suffix: suffix), quality: .original, client: client).query ?? ""
        }
        XCTAssertTrue(format("opus").contains("format=raw"))
        XCTAssertTrue(format("ogg").contains("format=mp3"))
        XCTAssertTrue(format("flac").contains("format=raw"))
    }
}
