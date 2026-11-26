import Foundation

enum SearchText {
    /// Lowercase, no accents, punctuation as spaces: "Sigur Rós" and "AC/DC" become "sigur ros" and "ac dc".
    static func normalize(_ text: String) -> String {
        let folded = text.folding(options: [.diacriticInsensitive, .caseInsensitive, .widthInsensitive], locale: nil)
        var out = ""
        var gap = false
        for character in folded {
            if character.isLetter || character.isNumber {
                if gap, !out.isEmpty { out.append(" ") }
                gap = false
                out.append(character)
            } else if character != "'" && character != "’" {
                gap = true
            }
        }
        return out
    }

    static func words(_ text: String) -> [String] { normalize(text).split(separator: " ").map(String.init) }

    /// One slip in a short word, two in a longer one, none under three letters.
    static func slips(_ term: String) -> Int { term.count < 3 ? 0 : term.count <= 5 ? 1 : 2 }

    /// Edits between two words, two swapped letters counting once. Anything over `max` answers `max + 1`.
    static func distance(_ a: [Character], _ b: [Character], max: Int) -> Int {
        guard abs(a.count - b.count) <= max, !a.isEmpty, !b.isEmpty else { return max + 1 }
        var before = [Int](repeating: 0, count: b.count + 1)
        var previous = Array(0...b.count)
        var current = before
        for i in 1...a.count {
            current[0] = i
            var best = i
            for j in 1...b.count {
                var cost = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1))
                if i > 1, j > 1, a[i - 1] == b[j - 2], a[i - 2] == b[j - 1] { cost = min(cost, before[j - 2] + 1) }
                current[j] = cost
                best = min(best, cost)
            }
            if best > max { return max + 1 }
            (before, previous, current) = (previous, current, before)
        }
        return Swift.min(previous[b.count], max + 1)
    }

    /// The indexed words a typed word may mean, with how far off each is: 0 the word, 1 its start, 2 and up a typo.
    static func candidates(_ term: String, in vocabulary: [String: [Character]]) -> [String: Int] {
        let typed = Array(term)
        let max = slips(term)
        var found: [String: Int] = [:]
        for (word, letters) in vocabulary {
            if word == term {
                found[word] = 0
            } else if word.hasPrefix(term) {
                found[word] = 1
            } else if max > 0 {
                let off = distance(typed, letters, max: max)
                if off <= max { found[word] = 1 + off }
            }
        }
        return found
    }
}

/// `artist:"massive attack" year:1990..1999 teardrop`, the web player's filters (docs/search.md).
struct SearchQuery: Equatable {
    struct Filter: Equatable, Hashable {
        let key: String
        let value: String
        /// As typed, so removing its chip can take it out of the field.
        let raw: String
    }

    var text = ""
    var filters: [Filter] = []
    var lyricsOnly = false

    var isEmpty: Bool { text.isEmpty && filters.isEmpty }

    static let keys = ["artist", "album", "genre", "year", "format"]

    init(_ raw: String) {
        var rest = raw
        if let match = rest.range(of: #"(?i)(^|\s)lyrics:\s*"#, options: .regularExpression) {
            lyricsOnly = true
            rest.replaceSubrange(match, with: " ")
        }
        let pattern = try! NSRegularExpression(pattern: #"(?<!\S)(artist|album|genre|year|format):("[^"]*"?|\S+)"#, options: .caseInsensitive)
        let source = rest as NSString
        for match in pattern.matches(in: rest, range: NSRange(location: 0, length: source.length)) {
            let value = source.substring(with: match.range(at: 2)).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
            let typed = source.substring(with: match.range)
            filters.append(Filter(key: source.substring(with: match.range(at: 1)).lowercased(), value: value, raw: typed))
        }
        for filter in filters { rest = rest.replacingOccurrences(of: filter.raw, with: " ") }
        text = rest.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// `1998`, `1990..1999`, `..1980` or `1990..`.
    static func years(_ value: String) -> ClosedRange<Int>? {
        let parts = value.components(separatedBy: "..")
        if parts.count == 1 { return Int(value).map { $0...$0 } }
        guard parts.count == 2 else { return nil }
        let low = Int(parts[0]), high = Int(parts[1])
        guard low != nil || high != nil, (low ?? 0) <= (high ?? .max) else { return nil }
        return (low ?? 0)...(high ?? .max)
    }
}

/// The library and the lyrics on the phone, prepared once so each keystroke only compares words.
struct SearchIndex {
    struct Results {
        var artists: [Artist] = []
        var albums: [Album] = []
        var playlists: [Playlist] = []
        var songs: [Song] = []
        var lyrics: [LyricsHit] = []
        var isEmpty: Bool { artists.isEmpty && albums.isEmpty && playlists.isEmpty && songs.isEmpty && lyrics.isEmpty }
    }

    private struct Entry<Item> {
        let item: Item
        let name: String
        let tight: String
        let words: Set<String>
    }

    private struct Words {
        let song: Song
        let lines: [(start: Double?, text: String, words: [String])]
        let all: Set<String>
        let joined: String
    }

    private var artists: [Entry<Artist>] = []
    private var albums: [Entry<Album>] = []
    private var playlists: [Entry<Playlist>] = []
    private var songs: [Entry<Song>] = []
    private var lyrics: [Words] = []
    private var vocabulary: [String: [Character]] = [:]
    private var albumsByID: [String: Album] = [:]

    init() {}

    init(artists: [Artist], albums: [Album], playlists: [Playlist], songs: [Song], lyrics: [String: Lyrics] = [:]) {
        self.artists = artists.map { entry($0, $0.name) }
        self.albums = albums.map { entry($0, $0.name, $0.artist) }
        self.playlists = playlists.map { entry($0, $0.name) }
        self.songs = songs.map { entry($0, $0.title, $0.artist, $0.album) }
        albumsByID = Dictionary(albums.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for song in songs {
            guard let found = lyrics[song.id] else { continue }
            let lines = found.lines.map { (start: found.status == .synced ? $0.start : nil, text: $0.text, words: SearchText.words($0.text)) }
            let all = Set(lines.flatMap(\.words))
            for word in all where vocabulary[word] == nil { vocabulary[word] = Array(word) }
            self.lyrics.append(Words(song: song, lines: lines, all: all, joined: lines.flatMap(\.words).joined(separator: " ")))
        }
    }

    private mutating func entry<Item>(_ item: Item, _ name: String, _ more: String?...) -> Entry<Item> {
        let normalized = SearchText.normalize(name)
        var words = Set(normalized.split(separator: " ").map(String.init))
        for text in more.compactMap({ $0 }) { words.formUnion(SearchText.words(text)) }
        for word in words where vocabulary[word] == nil { vocabulary[word] = Array(word) }
        return Entry(item: item, name: normalized, tight: normalized.replacingOccurrences(of: " ", with: ""), words: words)
    }

    func search(_ query: SearchQuery) -> Results {
        guard !query.isEmpty else { return Results() }
        let phrase = SearchText.normalize(query.text)
        let terms = phrase.split(separator: " ").map(String.init)
        // Nothing but punctuation typed: not the same as nothing typed.
        if !query.text.isEmpty && terms.isEmpty { return Results() }
        let matches = terms.map { SearchText.candidates($0, in: vocabulary) }

        func rank<Item>(_ entries: [Entry<Item>], _ limit: Int, _ keep: (Item) -> Bool) -> [Item] {
            let tight = phrase.replacingOccurrences(of: " ", with: "")
            var hits: [(tier: Int, at: Int, item: Item)] = []
            for (at, entry) in entries.enumerated() {
                guard keep(entry.item), let tier = terms.isEmpty ? 0 : tier(entry, phrase, tight, matches) else { continue }
                hits.append((tier, at, entry.item))
            }
            return hits.sorted { ($0.tier, $0.at) < ($1.tier, $1.at) }.prefix(limit).map(\.item)
        }

        var results = Results()
        if !query.lyricsOnly {
            let filtered = !query.filters.isEmpty
            let only = Set(query.filters.map(\.key))
            if only.isSubset(of: ["artist"]) { results.artists = rank(artists, 5) { passes(query.filters, artist: $0.name) } }
            if !only.contains("format") {
                results.albums = rank(albums, 8) { passes(query.filters, artist: $0.artist, album: $0.name, genre: $0.genre, year: $0.year) }
            }
            if !filtered { results.playlists = rank(playlists, 5) { _ in true } }
            results.songs = rank(songs, 50) { song in
                let album = song.albumId.flatMap { albumsByID[$0] }
                return passes(query.filters, artist: song.artist, album: song.album, genre: song.genre ?? album?.genre,
                              year: song.year ?? album?.year, format: song.suffix)
            }
        }
        if query.filters.isEmpty, query.lyricsOnly || phrase.count >= 3 { results.lyrics = lines(phrase, terms) }
        return results
    }

    /// 0 the whole name, 1 its start, 2 every word, 3 every word with typos. Lower is better.
    private func tier<Item>(_ entry: Entry<Item>, _ phrase: String, _ tight: String, _ matches: [[String: Int]]) -> Int? {
        if entry.name == phrase || entry.tight == tight { return 0 }
        if entry.name.hasPrefix(phrase) || entry.tight.hasPrefix(tight) { return 1 }
        // Mid word too: titles in scripts without spaces are one long word.
        if entry.tight.contains(tight) { return 2 }
        var worst = 0
        for match in matches {
            guard let best = entry.words.compactMap({ match[$0] }).min() else { return nil }
            worst = max(worst, best)
        }
        return worst <= 1 ? 2 : 3
    }

    private func passes(_ filters: [SearchQuery.Filter], artist: String?, album: String? = nil, genre: String? = nil,
                        year: Int? = nil, format: String? = nil) -> Bool {
        filters.allSatisfy { filter in
            let has = { (text: String?) in SearchText.normalize(text ?? "").contains(SearchText.normalize(filter.value)) }
            switch filter.key {
            case "artist": return has(artist)
            case "album": return has(album)
            case "genre": return has(genre)
            case "year": return year.map { SearchQuery.years(filter.value)?.contains($0) ?? false } ?? false
            case "format": return format?.lowercased() == filter.value.lowercased()
            default: return true
            }
        }
    }

    /// Songs whose words hold everything typed, each with the line that holds most of it.
    private func lines(_ phrase: String, _ terms: [String], limit: Int = 8) -> [LyricsHit] {
        guard !terms.isEmpty else { return [] }
        let matches = terms.map { SearchText.candidates($0, in: vocabulary) }
        var hits: [(tier: Int, at: Int, hit: LyricsHit)] = []
        for (at, words) in lyrics.enumerated() {
            let off = matches.map { match in words.all.compactMap { match[$0] }.min() }
            guard off.allSatisfy({ $0 != nil }) else { continue }
            func found(_ index: Int) -> Set<Int> {
                guard words.lines.indices.contains(index) else { return [] }
                return Set(matches.indices.filter { term in words.lines[index].words.contains { matches[term][$0] != nil } })
            }
            var best = 0
            var score = (-1, -1)
            for index in words.lines.indices {
                let own = found(index)
                let next = (own.union(found(index + 1)).count, own.count)
                if next > score { (best, score) = (index, next) }
            }
            let tier = words.joined.contains(phrase) ? 0 : off.compactMap { $0 }.max()! <= 1 ? 1 : 2
            let line = words.lines[best]
            hits.append((tier, at, LyricsHit(song: words.song, start: line.start, text: line.text)))
        }
        return hits.sorted { ($0.tier, $0.at) < ($1.tier, $1.at) }.prefix(limit).map(\.hit)
    }
}
