import Foundation
import XCTest
@testable import LodesongCore

final class PlaylistShelfTests: XCTestCase {
    func testFoldersAndPicturesStayWhenTheServerIsGone() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubServer.self]
        let client = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        let store = try LibraryStore(path: ":memory:")
        let pictures = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: pictures) }
        StubServer.answers = [
            "folders": #"{"folders":[{"id":"f1","parentId":null,"name":"Chill","coverVersion":"abc"}],"items":[]}"#,
            "covers": #"{"covers":[]}"#,
            "cover": #"{"picture":true}"#,
        ]
        await ShelfSync.run(client: client, store: store, pictures: pictures)
        StubServer.answers = [:]
        await ShelfSync.run(client: client, store: store, pictures: pictures)

        XCTAssertEqual(store.shelf().folders.map(\.name), ["Chill"])
        XCTAssertTrue(FileManager.default.fileExists(atPath: ShelfSync.file("abc", in: pictures).path))
    }

    func testTreeNestsRealFoldersAndNamedOnesLikeTheWeb() throws {
        let playlists = [
            Playlist(id: "p1", name: "Night"), Playlist(id: "p2", name: "Gym / Legs"), Playlist(id: "p3", name: "Loose"),
        ]
        let shelf = PlaylistShelf(
            folders: [PlaylistFolder(id: "a", name: "Chill"), PlaylistFolder(id: "b", parentId: "a", name: "Late")],
            items: [FolderItem(playlistId: "p1", folderId: "b"), FolderItem(playlistId: "p3", folderId: "gone")]
        )
        let tree = FolderNode.tree(playlists, shelf)

        XCTAssertEqual(tree.folders.map(\.name), ["Chill", "Gym"])
        XCTAssertEqual(tree.find("b")?.chain, ["Chill", "Late"])
        XCTAssertEqual(tree.find("b")?.node.playlists.map(\.id), ["p1"])
        XCTAssertEqual(tree.find("/Gym")?.node.playlists.map { FolderNode.shownName($0, chain: ["Gym"]) }, ["Legs"])
        XCTAssertEqual(tree.playlists.map(\.id), ["p3"])
        XCTAssertEqual(tree.keeping { $0.id == "p1" }.folders.map(\.name), ["Chill"])
    }

    func testSongSortsKeepThePlaylistOrderForTiesAndSearchIgnoresAccents() {
        let songs = [
            Song(id: "1", title: "Zed", artist: "Béa", duration: 100),
            Song(id: "2", title: "alpha", artist: "Cy", duration: 100),
            Song(id: "3", title: "Mid", artist: "Al", duration: 50),
        ]
        XCTAssertEqual(SongSort.server.sorted(songs).map(\.id), ["1", "2", "3"])
        XCTAssertEqual(SongSort.title.sorted(songs).map(\.id), ["2", "3", "1"])
        XCTAssertEqual(SongSort.artist.sorted(songs).map(\.id), ["3", "1", "2"])
        XCTAssertEqual(SongSort.duration.sorted(songs).map(\.id), ["3", "1", "2"])
        XCTAssertEqual(songs.filter { $0.matches("bea") }.map(\.id), ["1"])
    }

    func testAShareLinkIsAskedHereAndMadeOnTheMainAddress() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubServer.self]
        let client = ServerClient(
            server: URL(string: "http://10.0.0.2:4533")!, session: URLSession(configuration: configuration),
            home: URL(string: "https://music.test")!
        )
        StubServer.codes = [:]
        StubServer.answers = ["share": #"{"share":"a","path":"/playlist/p1?s=token"}"#]
        let link = try await client.shareLink(kind: "playlist", id: "p1")
        XCTAssertEqual(link.absoluteString, "https://music.test/playlist/p1?s=token")
    }
}
