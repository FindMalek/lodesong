import Foundation
import XCTest
@testable import LodesongCore

final class StorageSettingsTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    func testAPlaylistsOwnChoiceBeatsTheSettings() throws {
        let store = try LibraryStore(path: ":memory:")
        let downloads = DownloadLibrary(root: root)
        func sync(_ songs: [String]) throws {
            let all = songs.map { Song(id: $0, title: $0, suffix: "mp3") }
            let ids = ["on", "off", "unset"]
            try store.apply(LibrarySnapshot(
                songs: all,
                playlists: ids.map { Playlist(id: $0, name: $0) },
                entries: Dictionary(uniqueKeysWithValues: ids.map { ($0, all) })
            ))
        }
        func total(_ id: String) -> Int? { downloads.progress(DownloadRef(kind: .playlist, id: id))?.total }
        try sync(["a"])
        for id in ["on", "off", "unset"] { downloads.keep(DownloadRef(kind: .playlist, id: id), from: store) }
        downloads.setFollows(true, DownloadRef(kind: .playlist, id: "on"))
        downloads.setFollows(false, DownloadRef(kind: .playlist, id: "off"))
        try sync(["a", "b"])

        downloads.reconcile(with: store, manual: false, auto: false)
        XCTAssertEqual([total("on"), total("off"), total("unset")], [2, 1, 1])
        downloads.reconcile(with: store, manual: false, auto: true)
        XCTAssertEqual([total("on"), total("off"), total("unset")], [2, 1, 2])
        // Sync Now takes everything, and the choices survive it and a relaunch.
        downloads.reconcile(with: store)
        XCTAssertEqual(total("off"), 2)
        XCTAssertEqual(DownloadLibrary(root: root).collections.map(\.follows), [true, false, nil])
    }

    func testTheSizeLimitDropsTheOldestSongThatIsNotNeeded() throws {
        let cache = SongCache(folder: root)
        for (age, id) in ["needed", "old", "new"].enumerated() {
            let file = root.appendingPathComponent("\(id).mp3")
            try Data(count: 100).write(to: file)
            try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSince1970: Double(age))], ofItemAtPath: file.path)
        }
        cache.trim(to: 200, keeping: ["needed"])
        XCTAssertNotNil(cache.file("needed"))
        XCTAssertNil(cache.file("old"))
        XCTAssertNotNil(cache.file("new"))
    }

    func testTheFallbackFormatIsTriedAfterThePreferredOne() {
        let pick = { AudioSource.pick(suffix: "wma", hasFile: false, hasFallback: true, failed: $0) }
        XCTAssertEqual(pick([]), .transcoded)
        XCTAssertEqual(pick([.transcoded]), .fallback)
        XCTAssertNil(pick([.transcoded, .fallback]))
        // Under a bit rate limit the fallback comes before giving up on converting.
        XCTAssertEqual(AudioSource.pick(suffix: "flac", hasFile: false, limited: true, hasFallback: true, failed: [.transcoded]), .fallback)
    }
}
