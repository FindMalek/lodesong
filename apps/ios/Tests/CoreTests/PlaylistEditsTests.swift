import Foundation
import XCTest
@testable import LodesongCore

/// A server with one playlist, which notes what it was asked to change.
private final class PlaylistServer: URLProtocol {
    static var songs: [String] = []
    static var calls: [String] = []
    static var refused: String?
    static var stored = 3

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let endpoint = request.url!.lastPathComponent
        Self.calls.append(endpoint)
        var playlist = ""
        if endpoint == "getPlaylist" {
            playlist = #","playlist":{"entry":["# + Self.songs.map { #"{"id":"\#($0)","title":"t"}"# }.joined(separator: ",") + "]}"
        }
        if endpoint == "getPlaylists" {
            playlist = #","playlists":{"playlist":[{"id":"gym","name":"Gym","changed":"2","songCount":\#(Self.stored)},{"id":"run","name":"Run","changed":"2"}]}"#
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: endpoint == Self.refused ? 500 : 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"subsonic-response":{"status":"ok"\#(playlist)}}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

final class PlaylistEditsTests: XCTestCase {
    private var client: ServerClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PlaylistServer.self]
        return ServerClient(server: URL(string: "http://x.test")!, session: URLSession(configuration: config))
    }

    override func setUp() {
        PlaylistServer.calls = []
        PlaylistServer.refused = nil
        PlaylistServer.stored = 3
        PlaylistServer.songs = ["a", "b", "c"]
    }

    func testOnlyOwnPlainPlaylistsCanBeEdited() {
        XCTAssertTrue(Playlist(id: "1", name: "n", owner: "Demo").editable(by: "demo"))
        XCTAssertFalse(Playlist(id: "1", name: "n", owner: "other").editable(by: "demo"))
        XCTAssertFalse(Playlist(id: "1", name: "n", owner: "demo", readonly: true).editable(by: "demo"))
        XCTAssertFalse(Playlist(id: "1", name: "n", owner: "demo", validUntil: "2027-01-01").editable(by: "demo"))
    }

    func testRemovalsGoByPositionAndAnythingElseSendsTheList() {
        XCTAssertEqual(PlaylistSongChange(from: ["a", "b", "a"], to: ["b", "a"]), .remove([0]))
        XCTAssertEqual(PlaylistSongChange(from: ["a"], to: []), .remove([0]))
        XCTAssertEqual(PlaylistSongChange(from: ["a", "b"], to: ["b", "a"]), .rewrite(["b", "a"]))
        XCTAssertEqual(PlaylistSongChange(from: ["a", "b"], to: ["a", "b"]), .none)
    }

    func testAPlaylistChangedElsewhereIsNotOverwritten() async {
        PlaylistServer.songs = ["a", "b", "c", "added on the web"]
        do {
            try await client.changeSongs(playlist: "gym", from: ["a", "b", "c"], to: ["c", "b", "a"])
            XCTFail("overwrote")
        } catch {
            XCTAssertEqual(error as? PlaylistEditError, .changedElsewhere)
        }
        XCTAssertEqual(PlaylistServer.calls, ["getPlaylist"])
    }

    func testAPlaylistWithHiddenSongsIsNotRewrittenOrRemovedFrom() async {
        PlaylistServer.stored = 4
        for new in [["c", "b", "a"], ["a", "b"]] {
            do {
                try await client.changeSongs(playlist: "gym", from: ["a", "b", "c"], to: new)
                XCTFail("changed")
            } catch {
                XCTAssertEqual(error as? PlaylistEditError, .hiddenSongs)
            }
        }
        XCTAssertEqual(PlaylistServer.calls, ["getPlaylist", "getPlaylists", "getPlaylist", "getPlaylists"])
    }

    func testAFailedRenameAfterTheSongsSavedSaysSo() async {
        PlaylistServer.refused = "updatePlaylist"
        do {
            try await client.savePlaylist("gym", from: ["a", "b", "c"], to: ["c", "b", "a"], name: "Legs", comment: nil, isPublic: nil)
            XCTFail("renamed")
        } catch {
            guard case .detailsNotSaved = error as? PlaylistEditError else { return XCTFail("\(error)") }
        }
        XCTAssertEqual(PlaylistServer.calls, ["getPlaylist", "getPlaylists", "createPlaylist", "updatePlaylist"])
    }

    /// Storing another playlist's new stamp without its songs would make the next sync skip it.
    func testRefreshingAfterAnEditBringsEveryMovedPlaylistsSongs() async throws {
        let store = try LibraryStore(path: ":memory:")
        try store.apply(LibrarySnapshot(
            songs: [Song(id: "a", title: "t")],
            playlists: [Playlist(id: "gym", name: "Gym", changed: "1"), Playlist(id: "run", name: "Run", changed: "1")],
            entries: [:]
        ))
        try await LibrarySync.playlists(client: client, store: store, changed: "gym")
        XCTAssertEqual(store.entries(playlist: "run").map(\.id), ["a", "b", "c"])
        XCTAssertEqual(store.songs().count, 1)
    }
}
