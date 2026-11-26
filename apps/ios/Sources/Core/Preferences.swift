import Foundation

/// What Settings stores in `UserDefaults`, and the defaults the app works with when it is never opened.
enum Pref {
    static let reportPlayback = "reportPlayback"
    static let scrobblePercent = "scrobblePercent"
    static let scrobbleMinutes = "scrobbleMinutes"
    static let queueSync = "queueSync"
    static let replayGain = "replayGain"
    static let keepShuffle = "keepShuffle"
    static let speed = "playbackSpeed"
    static let wifiBitRate = "wifiBitRate"
    static let cellularBitRate = "cellularBitRate"
    static let lockSkipSeconds = "lockSkipSeconds"
    static let keepAwake = "keepAwake"
    static let appearance = "appearance"
    static let tint = "tint"
    static let tintCustom = "tintCustom"
    static let minimizeTabBar = "minimizeTabBar"
    static let movingBackground = "movingBackground"
    static let swipeLeading = "swipeLeading"
    static let swipeTrailing = "swipeTrailing"
    static let hiddenLibrary = "hiddenLibrary"
    static let libraryOrder = "libraryOrder"
    static let offlineMode = "offlineMode"
    static let cacheAhead = "cacheAhead"
    static let confirmReplace = "confirmReplace"
    static let coverSkipSeconds = "coverSkipSeconds"
    static let lyricSize = "lyricSize"
    static let redactHost = "redactHost"
    static let showAlbum = "showAlbum"
    static let coverShrinks = "coverShrinks"
    static let streamInfo = "streamInfo"

    /// Heard for this share of the song, or for this long, whichever comes first.
    static func pastScrobblePoint(_ seconds: TimeInterval, duration: TimeInterval, percent: Int, minutes: Int) -> Bool {
        seconds >= Double(minutes) * 60 || (duration > 0 && seconds >= duration * Double(percent) / 100)
    }
}

/// The rows and the grid on the Library page, each of which Settings can hide or move.
enum LibrarySection: String, CaseIterable {
    case playlists, artists, albums, songs, downloaded, recentlyAdded

    var title: String { self == .recentlyAdded ? "Recently Added" : rawValue.capitalized }

    /// The stored order, with any section it doesn't name at the end.
    static func ordered(_ raw: String) -> [LibrarySection] {
        var seen = Set<LibrarySection>()
        let named = raw.split(separator: ",").compactMap { LibrarySection(rawValue: String($0)) }.filter { seen.insert($0).inserted }
        return named + allCases.filter { !seen.contains($0) }
    }
}

extension UserDefaults {
    func bool(_ key: String, or fallback: Bool) -> Bool { object(forKey: key) as? Bool ?? fallback }
    func int(_ key: String, or fallback: Int) -> Int { object(forKey: key) as? Int ?? fallback }
}
