import Foundation
import XCTest
@testable import LodesongCore

/// Offline until told otherwise, then takes everything.
private final class MarksServer: URLProtocol {
    static var online = false
    static var requests: [String] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        guard Self.online else { return client!.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
        Self.requests.append("\(request.url!.lastPathComponent)?\(request.url!.query!)")
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client!.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client!.urlProtocol(self, didLoad: Data(#"{"subsonic-response":{"status":"ok"}}"#.utf8))
        client!.urlProtocolDidFinishLoading(self)
    }
}

@MainActor
final class NowPlayingTests: XCTestCase {
    func testLikeMadeOfflineShowsAtOnceAndIsSentLater() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MarksServer.self]
        let server = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        let song = Song(id: "s1", title: "One")
        var marks = SongMarks(folder: folder)

        marks.set(.like, 1, song: "s1", account: "a")
        await marks.flush(server, account: "a", client: "ios")
        XCTAssertTrue(marks.waiting(song: "s1", account: "a", offline: false))

        // The app is closed before the server is back.
        marks = SongMarks(folder: folder)
        XCTAssertTrue(marks.liked(song, account: "a"))
        MarksServer.online = true
        await marks.flush(server, account: "a", client: "ios")
        XCTAssertEqual(MarksServer.requests, ["star?f=json&id=s1"])
        XCTAssertFalse(marks.waiting(song: "s1", account: "a", offline: false))

        // Once a later sync has it, the library is believed again.
        marks.settle(account: "a", sentBefore: Date().addingTimeInterval(1))
        XCTAssertFalse(marks.liked(song, account: "a"))
    }

    func testACustomSpeedStaysPickableAndSteppingLandsOnTheUsualOnes() {
        XCTAssertEqual(Pref.speeds(including: 1.15), [0.75, 1, 1.15, 1.25, 1.5, 2])
        XCTAssertEqual(Pref.speeds(including: Pref.roundedSpeed(1.2 + 0.05)), [0.75, 1, 1.25, 1.5, 2])
    }

    func testOnlyWebAddressesBecomeLinks() {
        let linked = linkedText("Mix from https://example.com/a, ask me@example.com")
        XCTAssertEqual(linked.runs.compactMap(\.link), [URL(string: "https://example.com/a")!])
    }

    func testStreamLineSaysWhenWhatPlaysIsConverted() {
        let song = Song(id: "s1", title: "One", duration: 200, suffix: "flac", bitRate: 1011, samplingRate: 44100, bitDepth: 16)
        XCTAssertEqual(StreamLine.text(song, source: .original, limit: 320), "FLAC · 16-bit/44.1 kHz · 1011 kbps")
        XCTAssertEqual(StreamLine.text(song, source: .transcoded, limit: 192), "FLAC → MP3 · 192 kbps")
        XCTAssertEqual(StreamLine.text(song, source: .file, limit: 320, fileType: "mp3", fileBytes: 3_220_000), "FLAC → MP3 · 128 kbps")
    }
}
