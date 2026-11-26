import XCTest
@testable import LodesongCore

final class SearchTests: XCTestCase {
    private func index(lyrics: [String: Lyrics] = [:]) -> SearchIndex {
        SearchIndex(
            artists: [Artist(id: "r", name: "Radiohead"), Artist(id: "s", name: "Sigur Rós"), Artist(id: "a", name: "AC/DC")],
            albums: [Album(id: "ok", name: "OK Computer", artist: "Radiohead", year: 1997, genre: "Alternative")],
            playlists: [],
            songs: [
                Song(id: "1", title: "Airbag", artist: "Radiohead", album: "OK Computer", albumId: "ok", suffix: "flac"),
                Song(id: "2", title: "Back in Black", artist: "AC/DC", suffix: "mp3", year: 1980),
            ],
            lyrics: lyrics
        )
    }

    func testSearchForgivesTyposAccentsSpacingAndPunctuation() {
        let index = index()
        XCTAssertEqual(index.search(SearchQuery("radiohed")).artists.map(\.id), ["r"])
        XCTAssertEqual(index.search(SearchQuery("sigur ros")).artists.map(\.id), ["s"])
        XCTAssertEqual(index.search(SearchQuery("acdc")).artists.map(\.id), ["a"])
        XCTAssertEqual(index.search(SearchQuery("okcomputer")).albums.map(\.id), ["ok"])
        XCTAssertEqual(index.search(SearchQuery("radiohead airbag")).songs.map(\.id), ["1"])
        XCTAssertTrue(index.search(SearchQuery("zeppelin")).isEmpty)
    }

    func testFiltersNarrowWithOrWithoutText() {
        let index = index()
        XCTAssertEqual(index.search(SearchQuery("year:1990..1999")).songs.map(\.id), ["1"])
        XCTAssertEqual(index.search(SearchQuery("genre:alternative format:flac")).songs.map(\.id), ["1"])
        XCTAssertEqual(index.search(SearchQuery(#"artist:"ac/dc" black"#)).songs.map(\.id), ["2"])
        XCTAssertTrue(index.search(SearchQuery("year:..1979")).isEmpty)
    }

    func testSearchByLyricsShowsTheMatchingLine() {
        let words = Lyrics(status: .synced, lines: [.init(start: 1000, text: "In the next world war"), .init(start: 5000, text: "I'm counting the stars")])
        let results = index(lyrics: ["1": words]).search(SearchQuery("lyrics: im countign the stars"))
        XCTAssertEqual(results.lyrics, [LyricsHit(song: results.lyrics.first!.song, start: 5000, text: "I'm counting the stars")])
        XCTAssertEqual(results.lyrics.first?.song.id, "1")
        XCTAssertTrue(results.songs.isEmpty)
    }
}
