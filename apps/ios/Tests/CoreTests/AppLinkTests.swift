import Foundation
import XCTest
@testable import LodesongCore

final class AppLinkTests: XCTestCase {
    func testOnlyAlbumAndPlaylistPagesCanBeAskedFor() {
        func link(_ text: String) -> AppLink? { AppLink(URL(string: text)!) }
        XCTAssertEqual(link("lodesong://album/al-1"), .album("al-1"))
        XCTAssertEqual(link("LodeSong://Playlist/Ab%20c"), .playlist("Ab c"))
        XCTAssertNil(link("lodesong://signin?server=https://evil.test&user=a&password=b"))
        XCTAssertNil(link("lodesong://playlist/p1/delete"))
        XCTAssertNil(link("lodesong://playlist"))
        XCTAssertNil(link("https://album/al-1"))
        XCTAssertEqual(AppLink(spotlightID: AppLink.spotlightID(playlist: "p:1")), .playlist("p:1"))
    }
}
