import Foundation
import XCTest
@testable import LodesongCore

/// Stands in for the server: offline, or taking everything and keeping what history was sent.
private final class PlaysServer: URLProtocol {
    static var online = false
    static var scrobbles: [String] = []
    static var history: [[String: Any]] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        guard Self.online else { return client!.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
        if request.url!.lastPathComponent == "scrobble" {
            Self.scrobbles.append(request.url!.query!)
        } else if let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while case let read = stream.read(&buffer, maxLength: buffer.count), read > 0 { data.append(buffer, count: read) }
            Self.history.append(try! JSONSerialization.jsonObject(with: data) as! [String: Any])
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client!.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client!.urlProtocol(self, didLoad: Data(#"{"subsonic-response":{"status":"ok"}}"#.utf8))
        client!.urlProtocolDidFinishLoading(self)
    }
}

@MainActor
final class PlayLogTests: XCTestCase {
    private var folder: URL!
    private var server: ServerClient!
    private var time = Date(timeIntervalSince1970: 1000)
    private let song = Song(id: "s1", title: "One", duration: 100)

    override func setUp() async throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [PlaysServer.self]
        server = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        PlaysServer.online = false
        PlaysServer.scrobbles = []
        PlaysServer.history = []
    }

    override func tearDown() async throws { try? FileManager.default.removeItem(at: folder) }

    private func log() -> PlayLog { PlayLog(folder: folder) { self.time } }

    private func listen(_ log: PlayLog, from: Int, to: Int) {
        for second in from...to {
            log.hear(song, account: "me", position: Double(second), duration: 100)
            time += 1
        }
    }

    func testAnOfflinePlayReachesTheServerOnceWithItsOwnTimeAfterARestart() async {
        let offline = log()
        listen(offline, from: 0, to: 20)
        offline.jumped(to: 80)
        listen(offline, from: 80, to: 100)
        offline.count()
        offline.end()
        await offline.flush(server, account: "me", client: "ios-x")

        time += 3600
        PlaysServer.online = true
        let relaunched = log()
        await relaunched.flush(server, account: "me", client: "ios-x")
        await log().flush(server, account: "me", client: "ios-x")

        XCTAssertEqual(PlaysServer.scrobbles.count, 1)
        XCTAssertTrue(PlaysServer.scrobbles[0].contains("time=1000000"))
        XCTAssertEqual(PlaysServer.history.count, 1)
        XCTAssertEqual(PlaysServer.history[0]["started"] as? Int, 1_000_000)
        XCTAssertEqual(PlaysServer.history[0]["listened"] as? Double, 40)
        XCTAssertEqual(PlaysServer.history[0]["finished"] as? Bool, true)
        XCTAssertFalse((PlaysServer.history[0]["key"] as? String ?? "").isEmpty)
    }

    func testAPlayCutOffByARestartIsCarriedOnNotCountedTwice() async {
        PlaysServer.online = true
        let first = log()
        listen(first, from: 0, to: 40)
        // Scrubbed while paused, then the app is killed.
        first.jumped(to: 70)
        first.save()

        time += 60
        let second = log()
        await second.flush(server, account: "me", client: "ios-x")
        listen(second, from: 70, to: 100)
        second.end()
        await second.flush(server, account: "me", client: "ios-x")

        XCTAssertEqual(PlaysServer.history.map { $0["listened"] as? Double }, [70])
    }

    func testWhatAnotherDeviceSendsIsUnderstood() {
        XCTAssertEqual(DeviceMessage(#"{"t":"command","command":{"action":"seek","to":12}}"#), .command(.seek(to: 12)))
        XCTAssertEqual(DeviceMessage(#"{"t":"devices","devices":[{"id":"a","name":"x","active":false},{"id":"b","name":"y","active":true}]}"#), .devices([Device(id: "a", name: "x", active: false), Device(id: "b", name: "y", active: true)]))
        let take = #"{"t":"take","state":{"songs":[{"id":"s1","title":"One"}],"position":10,"playing":true},"stamped":1000,"now":3000}"#
        XCTAssertEqual(DeviceMessage(take), .take(DeviceState(songs: [Song(id: "s1", title: "One")], position: 12, playing: true)))
    }
}
