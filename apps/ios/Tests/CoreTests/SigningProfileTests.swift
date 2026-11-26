import Foundation
import XCTest
@testable import LodesongCore

final class SigningProfileTests: XCTestCase {
    private let day: TimeInterval = 24 * 60 * 60

    func testTheExpiryIsReadFromInsideTheSignedBlob() throws {
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0"><dict>
        <key>CreationDate</key><date>2026-01-01T12:00:00Z</date>
        <key>ExpirationDate</key><date>2026-01-08T12:00:00Z</date>
        </dict></plist>
        """
        let signature = Data([0x30, 0x82, 0x00, 0xff])
        let profile = try XCTUnwrap(SigningProfile(signature + Data(plist.utf8) + signature))
        XCTAssertEqual(profile.expires, ISO8601DateFormatter().date(from: "2026-01-08T12:00:00Z"))
        XCTAssertEqual(profile.expiry(refreshed: profile.expires), profile.expires.addingTimeInterval(7 * day))
        XCTAssertNil(SigningProfile(signature))
    }

    func testWarningsComeTwoDaysAndOneDayBeforeAndSkipPastOnes() {
        let expiry = Date(timeIntervalSince1970: 1_000_000)
        let dates = { (now: Date) in SigningProfile.warnings(expiry: expiry, now: now).map(\.date) }
        XCTAssertEqual(dates(expiry - 7 * day), [expiry - 2 * day, expiry - day])
        XCTAssertEqual(dates(expiry - 1.5 * day), [expiry - day])
        XCTAssertEqual(dates(expiry), [])
    }
}
