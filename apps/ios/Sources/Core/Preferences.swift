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

    /// Heard for this share of the song, or for this long, whichever comes first.
    static func pastScrobblePoint(_ seconds: TimeInterval, duration: TimeInterval, percent: Int, minutes: Int) -> Bool {
        seconds >= Double(minutes) * 60 || (duration > 0 && seconds >= duration * Double(percent) / 100)
    }
}

extension UserDefaults {
    func bool(_ key: String, or fallback: Bool) -> Bool { object(forKey: key) as? Bool ?? fallback }
    func int(_ key: String, or fallback: Int) -> Int { object(forKey: key) as? Int ?? fallback }
}
