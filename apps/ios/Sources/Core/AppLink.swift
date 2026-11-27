import Foundation

/// A page something outside the app asks for: a `lodesong://` link or a Spotlight result. It only ever opens a
/// page, so nothing here signs in, plays or changes anything.
enum AppLink: Hashable {
    case album(String)
    case playlist(String)

    /// `lodesong://album/<id>` or `lodesong://playlist/<id>`, and nothing else.
    init?(_ url: URL) {
        guard url.scheme?.lowercased() == "lodesong" else { return nil }
        let path = url.pathComponents.filter { $0 != "/" }
        guard path.count == 1 else { return nil }
        switch url.host?.lowercased() {
        case "album": self = .album(path[0])
        case "playlist": self = .playlist(path[0])
        default: return nil
        }
    }

    private static let spotlightPrefix = "playlist:"

    /// What a playlist is indexed as in Spotlight.
    static func spotlightID(playlist id: String) -> String { spotlightPrefix + id }

    init?(spotlightID: String) {
        guard spotlightID.hasPrefix(Self.spotlightPrefix) else { return nil }
        self = .playlist(String(spotlightID.dropFirst(Self.spotlightPrefix.count)))
    }
}
