import Foundation

extension Pref {
    static let notifyNewTracks = "notifyNewTracks"
    /// When the user, or their refresh shortcut, last said the app was refreshed. Seconds since 1970.
    static let signingRefreshed = "signingRefreshed"
}

/// The app's `embedded.mobileprovision`: a signed blob with a plist in the middle of it. Simulator and unsigned
/// builds have none. SideStore and AltStore refresh by installing a new profile on the phone without touching this
/// file, so after a refresh it still holds the old date.
struct SigningProfile: Equatable {
    var created: Date?
    var expires: Date

    private static let day: TimeInterval = 24 * 60 * 60

    init?(_ data: Data) {
        guard let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex),
              let plist = try? PropertyListSerialization.propertyList(from: data.subdata(in: start.lowerBound..<end.upperBound), format: nil),
              let values = plist as? [String: Any],
              let expires = values["ExpirationDate"] as? Date else { return nil }
        self.created = values["CreationDate"] as? Date
        self.expires = expires
    }

    /// The later of what the file says and a full lifetime (7 days on a free Apple ID) after the last refresh.
    func expiry(refreshed: Date?) -> Date {
        guard let refreshed else { return expires }
        let lifetime = created.map { expires.timeIntervalSince($0) } ?? 7 * Self.day
        return max(expires, refreshed.addingTimeInterval(lifetime))
    }

    /// Whole days left, rounded down. Nil once the date has passed: the app is still open, so it was refreshed since.
    static func daysLeft(until expiry: Date, now: Date) -> Int? {
        expiry > now ? Int(expiry.timeIntervalSince(now) / day) : nil
    }

    /// When to warn: 2 days and 1 day before, leaving out the times already gone.
    static func warnings(expiry: Date, now: Date) -> [(days: Int, date: Date)] {
        [2, 1].map { (days: $0, date: expiry.addingTimeInterval(-Double($0) * day)) }.filter { $0.date > now }
    }
}
