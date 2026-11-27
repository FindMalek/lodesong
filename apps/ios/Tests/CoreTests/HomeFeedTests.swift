import Foundation
import XCTest
@testable import LodesongCore

final class HomeFeedTests: XCTestCase {
    func testWhatTheServerCantAnswerKeepsItsLastContent() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubServer.self]
        let client = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        StubServer.answers = [
            "getAlbumList2": #""albumList2":{"album":[{"id":"a1","name":"First"}]}"#,
            "history": #"{"plays":[{"song":{"id":"s1","title":"One"}},{"song":{"id":"broken"}}]}"#,
        ]
        let first = await HomeFeed().refreshed(from: client)
        StubServer.answers = ["getAlbumList2": #""albumList2":{}"#]
        let second = await first.refreshed(from: client)

        XCTAssertEqual(second.history.map(\.id), ["s1"])
        XCTAssertEqual(second.recentlyAdded, [])
        XCTAssertEqual(second.randomAlbums.map(\.id), ["a1"])
    }

    func testSavedLayoutKeepsOrderAndHiddenAndShowsNewSections() {
        let layout = HomeLayout("history,-upNext,gone")

        XCTAssertEqual(Array(layout.shown.prefix(2)), [.history, .recentlyPlayed])
        XCTAssertFalse(layout.shown.contains(.upNext))
        XCTAssertEqual(HomeLayout(layout.raw), layout)
    }
}
