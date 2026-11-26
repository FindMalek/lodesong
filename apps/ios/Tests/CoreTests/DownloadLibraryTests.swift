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

    private func finish(_ id: String, _ body: String = "ID3 pretend audio", status: Int = 200) -> Bool {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? Data(body.utf8).write(to: file)
        return downloads.accept(song: id, file: file, status: status)
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
        // A fresh instance reads the saved list, as after an app restart.
        XCTAssertNotNil(DownloadLibrary(root: root).localURL(song: "s1"))
    }

    func testAnErrorAnswerIsNeverSavedAsAudio() throws {
        try library(["gym": ["s1"]])
        downloads.keep(gym, from: store)

        XCTAssertFalse(finish("s1", "<!doctype html><title>502 Bad Gateway</title>"))
        XCTAssertFalse(finish("s1", #"{"subsonic-response":{"status":"failed"}}"#))
        XCTAssertFalse(finish("s1", status: 401))
        XCTAssertNil(downloads.localURL(song: "s1"))
        XCTAssertEqual(downloads.pending().map(\.id), ["s1"])
    }

    func testFormatsIOSCannotPlayAreAskedForAsMP3() {
        let client = ServerClient(server: URL(string: "https://music.test")!)
        let format = { (suffix: String) in
            DownloadLibrary.url(Song(id: "s", title: "s", suffix: suffix), quality: .original, client: client).query ?? ""
        }
        XCTAssertTrue(format("opus").contains("format=mp3"))
        XCTAssertTrue(format("flac").contains("format=raw"))
    }
}
