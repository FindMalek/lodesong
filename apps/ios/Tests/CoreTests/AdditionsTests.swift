import Foundation
import XCTest
@testable import LodesongCore

final class AdditionsTests: XCTestCase {
    private var client: ServerClient!

    override func setUp() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubServer.self]
        client = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        StubServer.answers = [:]
        StubServer.codes = [:]
    }

    override func tearDown() { StubServer.codes = [:] }

    func testAddingIsOfferedOnlyWhenTheServerSaysSo() async throws {
        StubServer.answers = ["session": #"{"user":"a","admin":false,"lyterionAdd":true}"#]
        let offered = try await client.canAddMusic()
        // No Lyterion, the public demo, or an older server that doesn't say.
        StubServer.answers = ["session": #"{"user":"a","admin":true}"#]
        let older = try await client.canAddMusic()

        XCTAssertTrue(offered)
        XCTAssertFalse(older)
    }

    func testTheServersReasonComesThrough() async {
        StubServer.answers = ["search": #"{"error":"that's a lot of searches for one hour, try again later"}"#]
        StubServer.codes = ["search": 429]
        do {
            _ = try await client.findMusic("teardrop")
            XCTFail("search should have failed")
        } catch {
            XCTAssertEqual(error.localizedDescription, "that's a lot of searches for one hour, try again later")
        }
    }

    func testASongTheScanAlreadyLinkedIsNotCalledMissing() async throws {
        StubServer.answers = ["status": #"{"status":"missing","stage":"linked"}"#]
        let next = try await client.advanced(Addition(id: "r1", input: "teardrop", wish: Wish(title: "Teardrop", artists: ["Massive Attack"])))

        XCTAssertEqual(next.status, .placed)
    }

    func testAnAdditionEndsOnTheLibrarysOwnCopy() async throws {
        let wish = Wish(title: "Teardrop", artists: ["Massive Attack"], cover: "data:image/png;base64,AA==")
        StubServer.answers = ["add": #"{"recordingId":"r1","meta":{"title":"Teardrop","artists":["Massive Attack"]}}"#]
        let added = try await client.addMusic(wish, input: "https://www.deezer.com/track/7")
        StubServer.answers = ["status": #"{"status":"working","stage":"fetching"}"#]
        let working = try await client.advanced(added)
        StubServer.answers = [
            "status": #"{"status":"placed","stage":"placed"}"#,
            "search3": #""searchResult3":{"song":[{"id":"other","title":"Teardrop","artist":"Someone"}]}"#,
        ]
        let placed = try await client.advanced(working)
        StubServer.answers["search3"] = #""searchResult3":{"song":[{"id":"s1","title":"Teardrop","artist":"Massive Attack"}]}"#
        let done = try await client.advanced(placed)

        XCTAssertEqual(working.stage, "fetching")
        XCTAssertNil(placed.song)
        XCTAssertTrue(placed.unsettled)
        XCTAssertEqual(done.song?.id, "s1")
        XCTAssertFalse(done.unsettled)
        XCTAssertEqual(done.wish.cover, wish.cover)
    }
}
