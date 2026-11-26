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
    /// "arpeggi" or "apple".
    static let playerStyle = "playerStyle"
    /// "mesh" or "mono".
    static let playerBackground = "playerBackground"
    static let coverSwipe = "coverSwipe"
    static let reverseCoverSwipe = "reverseCoverSwipe"
    static let controlSwipe = "controlSwipe"
    static let miniPlayerSwipe = "miniPlayerSwipe"
    static let scrollingTitles = "scrollingTitles"
    static let playerButtonOrder = "playerButtonOrder"
    static let hiddenPlayerButtons = "hiddenPlayerButtons"
    static let infinitePlay = "infinitePlay"
    static let scrobbleUseTime = "scrobbleUseTime"
    static let autoDownloadOnOpen = "autoDownloadOnOpen"
    static let autoDownloadPeriodic = "autoDownloadPeriodic"
    /// Zero leaves it to iOS.
    static let concurrentDownloads = "concurrentDownloads"
    static let cacheKeeps = "cacheKeeps"
    static let cacheLimit = "cacheLimitMB"
    static let keepStreamed = "keepStreamedSong"
    static let streamFormat = "streamFormat"
    static let fallbackFormat = "fallbackFormat"

    /// How far a swipe on the player controls steps. `coverSkipSeconds` stored 0 for "off" before the swipe had its own switch.
    static func stepSeconds(_ stored: Int) -> Int { stored > 0 ? stored : 10 }

    /// Heard for this share of the song, or for this long, whichever comes first. No `minutes`, only the share counts.
    static func pastScrobblePoint(_ seconds: TimeInterval, duration: TimeInterval, percent: Int, minutes: Int?) -> Bool {
        minutes.map { seconds >= Double($0) * 60 } == true || (duration > 0 && seconds >= duration * Double(percent) / 100)
    }
}

/// The buttons under the controls on now playing, each of which Settings can hide or move.
enum PlayerButton: String, CaseIterable {
    case airplay, settings, dismiss, lyrics, queue, sleep

    static let hiddenByDefault = "sleep"

    var title: String {
        switch self {
        case .airplay: return "AirPlay and Devices"
        case .sleep: return "Sleep Timer"
        default: return rawValue.capitalized
        }
    }

    /// The stored order, with any button it doesn't name at the end.
    static func ordered(_ raw: String) -> [PlayerButton] { storedOrder(raw) }

    /// While another device plays, the devices button is the way back, so it can't be hidden.
    static func shown(order: String, hidden: String, remote: Bool = false) -> [PlayerButton] {
        let hidden = Set(hidden.split(separator: ",").map(String.init))
        return ordered(order).filter { !hidden.contains($0.rawValue) || (remote && $0 == .airplay) }
    }
}

/// What asked for a library sync, which decides whether kept playlists take its changes.
enum SyncTrigger: Hashable {
    /// Something the user did.
    case manual
    case open, periodic, background
    /// Nobody asked for it: music that was added arrived, or the other playlists after one was edited here.
    case followUp

    /// A background wake counts for either setting: iOS picks the time, so it is neither.
    func allowed(onOpen: Bool, periodic: Bool) -> Bool {
        switch self {
        case .manual: true
        case .open: onOpen
        case .periodic: periodic
        case .background, .followUp: onOpen || periodic
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
    case playlists, artists, albums, songs, genres, favoriteSongs, favoriteAlbums, favoriteArtists, downloaded, recentlyAdded

    var title: String {
        switch self {
        case .favoriteSongs: return "Favorite Songs"
        case .favoriteAlbums: return "Favorite Albums"
        case .favoriteArtists: return "Favorite Artists"
        case .recentlyAdded: return "Recently Added"
        default: return rawValue.capitalized
        }
    }

    /// The stored order. A row it doesn't name yet goes above the grid, where it isn't buried.
    static func ordered(_ raw: String) -> [LibrarySection] {
        let named = Set(raw.split(separator: ",").map(String.init))
        var sections: [LibrarySection] = storedOrder(raw)
        guard let grid = sections.firstIndex(of: .recentlyAdded), named.contains(LibrarySection.recentlyAdded.rawValue) else { return sections }
        let new = sections[grid...].filter { !named.contains($0.rawValue) }
        sections.removeAll { new.contains($0) }
        sections.insert(contentsOf: new, at: grid)
        return sections
    }
}

extension UserDefaults {
    func bool(_ key: String, or fallback: Bool) -> Bool { object(forKey: key) as? Bool ?? fallback }
    func int(_ key: String, or fallback: Int) -> Int { object(forKey: key) as? Int ?? fallback }
}
