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
    /// Followed by a playlist id: the order its songs were last shown in.
    static let playlistSongSort = "playlistSongSort."
    static let showAlbum = "showAlbum"
    static let coverShrinks = "coverShrinks"
    static let streamInfo = "streamInfo"
    static let autoDownloadOnOpen = "autoDownloadOnOpen"
    static let autoDownloadPeriodic = "autoDownloadPeriodic"
    /// Zero leaves it to iOS.
    static let concurrentDownloads = "concurrentDownloads"
    static let cacheKeeps = "cacheKeeps"
    static let cacheLimit = "cacheLimitMB"
    static let keepStreamed = "keepStreamedSong"
    static let streamFormat = "streamFormat"
    static let fallbackFormat = "fallbackFormat"

    /// Heard for this share of the song, or for this long, whichever comes first.
    static func pastScrobblePoint(_ seconds: TimeInterval, duration: TimeInterval, percent: Int, minutes: Int) -> Bool {
        seconds >= Double(minutes) * 60 || (duration > 0 && seconds >= duration * Double(percent) / 100)
    }
}

/// What asked for a library sync, which decides whether kept playlists take its changes.
enum SyncTrigger: Hashable {
    /// Something the user did.
    case manual
    case open, periodic, background

    /// A background wake counts for either setting: iOS picks the time, so it is neither.
    func allowed(onOpen: Bool, periodic: Bool) -> Bool {
        switch self {
        case .manual: true
        case .open: onOpen
        case .periodic: periodic
        case .background: onOpen || periodic
        }
    }
}

/// How the songs fetched by the player are held.
struct CacheSettings: Equatable {
    /// Songs stay until the size limit pushes them out, somewhere iOS doesn't clear. Off, they are temporary.
    let keeps: Bool
    /// Zero is no limit.
    let maxBytes: Int
    let keepStreamed: Bool

    init(_ defaults: UserDefaults = .standard) {
        keeps = defaults.bool(Pref.cacheKeeps, or: false)
        maxBytes = defaults.int(Pref.cacheLimit, or: 1000) * 1_000_000
        keepStreamed = defaults.bool(Pref.keepStreamed, or: false)
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
