import Foundation

/// The Home sections, in their default order.
enum HomeSection: String, CaseIterable, Codable {
    case upNext, recentlyPlayed, recentlyAdded, frequentlyPlayed, topPlayed, history, playlists
    case favoriteSongs, favoriteAlbums, favoriteArtists, randomAlbums, randomSongs

    var title: String {
        switch self {
        case .upNext: return "Up Next"
        case .recentlyPlayed: return "Recently Played"
        case .recentlyAdded: return "Recently Added"
        case .frequentlyPlayed: return "Frequently Played"
        case .topPlayed: return "Top Played"
        case .history: return "Song History"
        case .playlists: return "Playlists"
        case .favoriteSongs: return "Favorite Songs"
        case .favoriteAlbums: return "Favorite Albums"
        case .favoriteArtists: return "Favorite Artists"
        case .randomAlbums: return "Random Albums"
        case .randomSongs: return "Random Songs"
        }
    }
}

/// Which sections show and in what order, kept as one string: "history,-upNext,…" where "-" means hidden.
struct HomeLayout: Equatable {
    struct Item: Equatable, Identifiable {
        let section: HomeSection
        var shown = true
        var id: HomeSection { section }
    }

    var items: [Item]

    /// Sections the string doesn't know, such as ones added by an update, go last and show.
    init(_ raw: String) {
        var seen = Set<HomeSection>()
        items = raw.split(separator: ",").compactMap { part in
            let hidden = part.hasPrefix("-")
            guard let section = HomeSection(rawValue: String(hidden ? part.dropFirst() : part)), seen.insert(section).inserted else { return nil }
            return Item(section: section, shown: !hidden)
        }
        items += HomeSection.allCases.filter { !seen.contains($0) }.map { Item(section: $0) }
    }

    var raw: String { items.map { ($0.shown ? "" : "-") + $0.section.rawValue }.joined(separator: ",") }
    var shown: [HomeSection] { items.filter(\.shown).map(\.section) }
}

/// What the server said last time, so Home opens at once and still shows with no network.
struct HomeFeed: Codable, Equatable {
    var recentlyPlayed: [Album] = []
    var recentlyAdded: [Album] = []
    var frequentlyPlayed: [Album] = []
    var topPlayed: [Song] = []
    var history: [Song] = []
    var favoriteSongs: [Song] = []
    var favoriteAlbums: [Album] = []
    var favoriteArtists: [Artist] = []
    var randomAlbums: [Album] = []
    var randomSongs: [Song] = []
    /// The day the random picks were made; they hold until the next one, or a pull to refresh.
    var randomDay = 0

    /// Asks for everything at once. A part the server can't answer keeps what it was.
    func refreshed(from client: ServerClient, now: Date = Date(), reshuffle: Bool = false) async -> HomeFeed {
        var feed = self
        let day = Calendar.current.ordinality(of: .day, in: .era, for: now) ?? 0
        let shuffle = reshuffle || day != randomDay
        async let recent = try? client.albums("recent")
        async let newest = try? client.albums("newest")
        async let frequent = try? client.albums("frequent")
        async let top = try? client.topSongs(now: now)
        async let played = try? client.playedSongs()
        async let starred = try? client.starred()
        async let albums = shuffle || randomAlbums.isEmpty ? try? client.albums("random") : nil
        async let songs = shuffle || randomSongs.isEmpty ? try? client.randomSongs() : nil

        feed.recentlyPlayed = await recent ?? recentlyPlayed
        feed.recentlyAdded = await newest ?? recentlyAdded
        feed.frequentlyPlayed = await frequent ?? frequentlyPlayed
        feed.topPlayed = await top ?? topPlayed
        feed.history = await played ?? history
        if let starred = await starred {
            feed.favoriteSongs = starred.song ?? []
            feed.favoriteAlbums = starred.album ?? []
            feed.favoriteArtists = starred.artist ?? []
        }
        let (newAlbums, newSongs) = await (albums, songs)
        if newAlbums != nil || newSongs != nil { feed.randomDay = day }
        feed.randomAlbums = newAlbums ?? randomAlbums
        feed.randomSongs = newSongs ?? randomSongs
        return feed
    }

    static func load(_ file: URL) -> HomeFeed {
        (try? JSONDecoder().decode(HomeFeed.self, from: Data(contentsOf: file))) ?? HomeFeed()
    }

    func save(_ file: URL) {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? JSONEncoder().encode(self).write(to: file, options: .atomic)
    }
}
