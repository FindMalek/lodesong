import Foundation
import XCTest
@testable import LodesongCore

/// Stands in for the server: answers by endpoint, or fails like a dropped network.
final class StubServer: URLProtocol {
    static var answers: [String: String] = [:]
    static var asked: [String] = []
    /// For answers that aren't a 200.
    static var codes: [String: Int] = [:]

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let name = request.url!.lastPathComponent
        Self.asked.append(name)
        guard let answer = Self.answers[name] else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.codes[name] ?? 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        // lodesong's own API answers plain JSON, Subsonic wraps it.
        let body = answer.hasPrefix("{") ? answer : #"{"subsonic-response":{"status":"ok",\#(answer)}}"#
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

final class LibrarySyncTests: XCTestCase {
    private var client: ServerClient!
    private var store: LibraryStore!

    override func setUpWithError() throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubServer.self]
        client = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        store = try LibraryStore(path: ":memory:")
        StubServer.asked = []
        StubServer.codes = [:]
        StubServer.answers = [
            "search3": #""searchResult3":{"song":[{"id":"s1","title":"One"}]}"#,
            "getPlaylists": #""playlists":{"playlist":[{"id":"p1","name":"Gym","changed":"t1"}]}"#,
            "getPlaylist": #""playlist":{"entry":[{"id":"s1","title":"One"}]}"#,
        ]
    }

    func testPlaylistSongsAreRefetchedOnlyWhenThePlaylistChanged() async throws {
        try await LibrarySync.run(client: client, store: store)
        try await LibrarySync.run(client: client, store: store)
        XCTAssertEqual(StubServer.asked.filter { $0 == "getPlaylist" }.count, 1)
        XCTAssertEqual(store.entries(playlist: "p1").map(\.id), ["s1"])

        StubServer.answers["getPlaylists"] = #""playlists":{"playlist":[{"id":"p1","name":"Gym","changed":"t2"}]}"#
        StubServer.answers["getPlaylist"] = #""playlist":{"entry":[{"id":"s2","title":"Two"}]}"#
        try await LibrarySync.run(client: client, store: store)
        XCTAssertEqual(store.entries(playlist: "p1").map(\.id), ["s2"])
    }

    func testSyncRefreshesTheChosenFolderAndDropsOneThatIsGone() async throws {
        StubServer.answers["getMusicFolders"] = #""musicFolders":{"musicFolder":[{"id":2,"name":"Live"}]}"#
        try store.saveFolder(FolderChoice(id: "2", name: "Live", songs: []))
        try await LibrarySync.run(client: client, store: store)
        // Playlist folders are saved by the same sync and must not share its rows.
        try store.save("folder", [String]())
        XCTAssertEqual(store.folder()?.songs, ["s1"])

        StubServer.answers["getMusicFolders"] = #""musicFolders":{"musicFolder":[{"id":1,"name":"Music"}]}"#
        try await LibrarySync.run(client: client, store: store)
        XCTAssertNil(store.folder())
    }

    func testSmartPlaylistsAreAskedEveryTime() async throws {
        StubServer.answers["getPlaylists"] = #""playlists":{"playlist":[{"id":"p1","name":"Smart","changed":"t1","readonly":true}]}"#
        try await LibrarySync.run(client: client, store: store)
        try await LibrarySync.run(client: client, store: store)
        XCTAssertEqual(StubServer.asked.filter { $0 == "getPlaylist" }.count, 2)
    }

    func testSigningInToAPageThatIsntLodesongFails() async {
        StubServer.answers["login"] = #""hello":true"#
        do {
            try await client.signIn(user: "a", password: "b")
            XCTFail("sign in should have failed")
        } catch {}
    }

    func testLosingTheNetworkMidSyncKeepsTheLibrary() async throws {
        try await LibrarySync.run(client: client, store: store)
        StubServer.answers["getPlaylists"] = nil
        do {
            try await LibrarySync.run(client: client, store: store)
            XCTFail("sync should have failed")
        } catch {}
        XCTAssertEqual(store.songs().map(\.id), ["s1"])
        XCTAssertEqual(store.entries(playlist: "p1").map(\.id), ["s1"])
    }
}
