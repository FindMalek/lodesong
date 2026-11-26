import Foundation
import XCTest
@testable import LodesongCore

/// Answers every stream with audio, and notes what was asked for.
private final class AudioServer: URLProtocol {
    static var asked: [String] = []
    static var body = Data("ID3 pretend audio".utf8)

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        Self.asked.append(request.url!.query ?? "")
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.body)
        client?.urlProtocolDidFinishLoading(self)
    }
}

final class OfflineTests: XCTestCase {
    private let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    private func songs(_ ids: String...) -> [Song] { ids.map { Song(id: $0, title: $0, suffix: "mp3") } }

    func testOfflinePlaysOnlyWhatIsOnThePhoneFromTheSongTapped() {
        let queue = PlayQueue.available(songs("a", "b", "c", "d"), start: 1) { ["a", "d"].contains($0) }
        XCTAssertEqual(queue.songs.map(\.id), ["a", "d"])
        XCTAssertEqual(queue.start, 1)
    }

    func testOnlyAQueueWithSongsStillToComeNeedsConfirming() {
        let queue = PlayQueue(songs: songs("a", "b"))
        XCTAssertTrue(queue.wouldLose(songs("c")))
        XCTAssertFalse(queue.wouldLose(songs("a", "b")))
        XCTAssertFalse(PlayQueue(songs: songs("a", "b"), index: 1).wouldLose(songs("c")))
    }

    func testEveryPlaylistIsKeptExceptOnesRemovedByHand() throws {
        let store = try LibraryStore(path: ":memory:")
        try store.apply(LibrarySnapshot(
            songs: songs("s1", "s2"),
            playlists: [Playlist(id: "gym", name: "Gym"), Playlist(id: "run", name: "Run")],
            entries: ["gym": songs("s1"), "run": songs("s2")]
        ))
        let downloads = DownloadLibrary(root: root)
        downloads.keepPlaylists(from: store)
        downloads.remove(DownloadRef(kind: .playlist, id: "gym"))
        downloads.keepPlaylists(from: store)
        XCTAssertEqual(downloads.collections.map(\.ref.id), ["run"])
    }

    func testADownloadListFromBeforeStillLoads() throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let old = #"{"collections":[{"ref":{"kind":"playlist","id":"gym"},"name":"Gym","songs":[],"onServer":true}],"files":{}}"#
        try Data(old.utf8).write(to: root.appendingPathComponent("manifest.json"))
        XCTAssertEqual(DownloadLibrary(root: root).collections.map(\.name), ["Gym"])
    }

    func testSongsAheadAreCachedAndDroppedOnceTheQueueMovesOn() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AudioServer.self]
        AudioServer.asked = []
        let client = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        let cache = SongCache(folder: root)

        await cache.fill(songs("s-1", "s.2"), limit: 128, client: client) {}
        await cache.fill(songs("s-1"), limit: 128, client: client) {}
        XCTAssertEqual(AudioServer.asked, ["format=mp3&id=s-1&maxBitRate=128", "format=mp3&id=s.2&maxBitRate=128"])
        // A better copy than asked for counts; a smaller one is fetched again.
        await cache.fill(songs("s-1"), limit: 64, client: client) {}
        XCTAssertEqual(AudioServer.asked.count, 2)
        await cache.fill(songs("s-1"), limit: 320, client: client) {}
        XCTAssertEqual(AudioServer.asked.count, 3)

        cache.prune(keeping: ["s.2"])
        XCTAssertNil(cache.file("s-1"))
        XCTAssertNotNil(cache.file("s.2"))
    }

    func testASmallerCopyStaysWhenTheBetterOneArrivesCutShort() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AudioServer.self]
        // A WAV header with one second of silence, for a song that lasts a minute.
        let header: [UInt8] = Array("RIFF".utf8) + [164, 62, 0, 0] + Array("WAVEfmt ".utf8)
            + [16, 0, 0, 0, 1, 0, 1, 0, 64, 31, 0, 0, 128, 62, 0, 0, 2, 0, 16, 0] + Array("data".utf8) + [128, 62, 0, 0]
        let usual = AudioServer.body
        AudioServer.body = Data(header) + Data(count: 16000)
        defer { AudioServer.body = usual }
        let client = ServerClient(server: URL(string: "https://music.test")!, session: URLSession(configuration: configuration))
        let cache = SongCache(folder: root)
        try Data().write(to: root.appendingPathComponent("s.128.mp3"))

        await cache.fill([Song(id: "s", title: "s", duration: 60, suffix: "mp3")], limit: 320, client: client) {}
        XCTAssertEqual(cache.file("s")?.lastPathComponent, "s.128.mp3")
    }

    func testTheMainAddressWinsWhenItAnswersElseTheSecond() async {
        let main = URL(string: "https://home.test")!, second = URL(string: "https://away.test")!
        func pick(_ up: Set<URL>, current: URL) async -> URL {
            await ServerAddresses.pick(main: main, second: second, picked: nil, current: current) { up.contains($0) }
        }
        let both = await pick([main, second], current: second)
        let away = await pick([second], current: main)
        let neither = await pick([], current: second)
        XCTAssertEqual([both, away, neither], [main, second, second])
    }

    func testAPlainHTTPAddressIsOnlyUsedWhenPicked() async {
        let lan = URL(string: "http://192.168.1.5:4533")!, secure = URL(string: "https://music.test")!
        func pick(_ main: URL, _ second: URL, picked: URL? = nil) async -> URL {
            await ServerAddresses.pick(main: main, second: second, picked: picked, current: lan) { _ in
                XCTFail("nothing is asked when switching is not automatic")
                return true
            }
        }
        let used = [await pick(lan, secure), await pick(secure, lan), await pick(secure, lan, picked: lan)]
        XCTAssertEqual(used, [secure, secure, lan])
        XCTAssertEqual(ServerAddresses.starting(main: secure, second: lan), secure)
    }

    func testAnotherServersLibraryIsNotASecondAddress() {
        XCTAssertTrue(ServerAddresses.sameLibrary(known: ["a", "b"], found: ["a", "b", "new"]))
        XCTAssertFalse(ServerAddresses.sameLibrary(known: ["a", "b"], found: ["x", "y"]))
        XCTAssertFalse(ServerAddresses.sameLibrary(known: ["a"], found: []))
    }

    func testTheSecondAddressSharesDownloadsAndCovers() {
        let main = ServerClient(server: URL(string: "http://192.168.1.5:4533")!)
        let away = ServerClient(server: URL(string: "https://music.example.com")!, home: main.server)
        XCTAssertEqual(away.coverKey("al-1", size: 800), main.coverURL("al-1", size: 800))
        XCTAssertEqual(DownloadLibrary.folder(server: away.identity, user: "demo"), DownloadLibrary.folder(server: main.identity, user: "demo"))
        XCTAssertEqual(away.coverURL("al-1", size: 800).host, "music.example.com")
    }

    func testLibrarySectionsKeepTheirStoredOrderAndNewOnesGoLast() {
        XCTAssertEqual(LibrarySection.ordered("songs,albums,gone,songs"), [.songs, .albums, .playlists, .artists, .downloaded, .recentlyAdded])
    }

    func testSharedLogsCanHideTheServer() {
        let line = "Sync with http://192.168.1.5:4533/rest/search3 failed: no route to music.example.com"
        let hidden = AppLog.redact(line, hosts: ["Music.Example.com"])
        XCTAssertEqual(hidden, "Sync with http://[server]/rest/search3 failed: no route to [server]")
    }
}
