import XCTest
@testable import LodesongCore

final class BrowseTests: XCTestCase {
    func testReleaseKindFollowsTheTagsAndCompilationWins() {
        func kind(_ types: [String]?, compilation: Bool? = nil) -> ReleaseKind {
            Album(id: "a", name: "a", releaseTypes: types, isCompilation: compilation).releaseKind
        }
        XCTAssertEqual([kind(nil), kind(["EP"]), kind(["single"]), kind(["album", "live"]), kind(["album"], compilation: true), kind(["soundtrack"])],
                       [.album, .ep, .single, .live, .compilation, .other])
    }

    func testASongWithTwoGenresIsInBoth() {
        let genres = genreList([
            Song(id: "1", title: "a", genre: "Rock", genres: [Genre(name: "Rock"), Genre(name: "Pop")]),
            Song(id: "2", title: "b", genre: "Pop"),
        ])
        XCTAssertEqual(genres.map(\.name), ["Pop", "Rock"])
        XCTAssertEqual(genres.map { $0.songs.map(\.id) }, [["1", "2"], ["1"]])
    }

    func testDateAddedPutsTheNewestFirstAndUndatedLast() {
        let songs = [Song(id: "old", title: "a", created: "2025-01-01T00:00:00Z"), Song(id: "none", title: "b"), Song(id: "new", title: "c", created: "2026-01-01T00:00:00Z")]
        XCTAssertEqual(SongSort.added.sorted(songs).map(\.id), ["new", "old", "none"])
    }

    func testBiographyLosesItsMarkupAndReadMoreLink() {
        XCTAssertEqual(plainBiography(#"A <b>band</b> &amp; friends. <a href="https://last.fm/x">Read more on Last.fm</a>."#), "A band & friends.")
    }

    func testANewLibraryRowIsPutAboveTheGridOfAStoredOrder() {
        XCTAssertEqual(LibrarySection.ordered("songs,recentlyAdded").suffix(1), [.recentlyAdded])
        XCTAssertEqual(LibrarySection.ordered("recentlyAdded,songs").count, LibrarySection.allCases.count)
    }
}
