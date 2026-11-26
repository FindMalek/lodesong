import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = SearchView.initialQuery
    @State private var results: SearchIndex.Results?
    @AppStorage("recentSearches") private var recentSearches = ""
    @State private var answered = ""
    @StateObject private var index = LatestBuild<[Int], SearchIndex>()
    /// `lyrics.revision` once it has stopped moving: saving a kept playlist's lyrics moves it again and again.
    @State private var lyricsSeen: Int?
    @State private var fromServer: (query: String, hits: [LyricsHit]) = ("", [])
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var lyrics: LyricsModel
    private static var initialQuery: String {
        #if DEBUG
        ProcessInfo.processInfo.environment["LODESONG_QUERY"] ?? ""
        #else
        ""
        #endif
    }

    private var term: String { query.trimmingCharacters(in: .whitespaces) }

    private var version: [Int] {
        [model.libraryRevision, model.syncing ? 1 : 0, lyricsSeen ?? lyrics.revision]
    }

    private var recents: [String] { recentSearches.split(separator: "\n").map(String.init) }

    private var decades: [Int] {
        Set(model.library.albums.compactMap { $0.year }.filter { $0 > 0 }.map { $0 / 10 * 10 }).sorted(by: >)
    }

    var body: some View {
        Group {
            if query.isEmpty { browse } else { matches }
        }
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Artists, Songs, Lyrics and More")
        .autocorrectionDisabled()
        .onSubmit(of: .search) { remember(query) }
        .safeAreaInset(edge: .top, spacing: 0) { chips }
        .task(id: lyrics.revision) {
            if lyricsSeen != nil { try? await Task.sleep(for: .seconds(5)) }
            if !Task.isCancelled { lyricsSeen = lyrics.revision }
        }
        .task(id: Request(query: term, version: version)) { buildIndex() }
        .task(id: Request(query: term, version: [index.generation])) { await search() }
        .task(id: term) { await searchServer() }
    }

    private struct Request: Equatable {
        let query: String
        let version: [Int]
    }

    @ViewBuilder private var chips: some View {
        let parsed = SearchQuery(query)
        if !parsed.filters.isEmpty || parsed.lyricsOnly {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    if parsed.lyricsOnly { chip("lyrics only", removing: "lyrics:") }
                    ForEach(parsed.filters, id: \.self) { filter in
                        chip("\(filter.key): \(filter.value)", removing: filter.raw)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 6)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func chip(_ title: String, removing raw: String) -> some View {
        Button {
            query = query.replacingOccurrences(of: raw, with: "", options: .caseInsensitive).trimmingCharacters(in: .whitespaces)
        } label: {
            Label(title, systemImage: "xmark").font(.subheadline)
        }
        .buttonStyle(.glass)
        .accessibilityLabel("Remove filter \(title)")
    }

    private var browse: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                OfflineNotice()
                if !recents.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Recently Searched").font(.title2.bold())
                            Spacer()
                            Button("Clear") { recentSearches = "" }
                        }
                        ForEach(recents, id: \.self) { term in
                            Button { query = term } label: {
                                Label(term, systemImage: "clock").frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }
                    }
                }
                if !decades.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Browse by Decade").font(.title2.bold())
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                            ForEach(Array(decades.enumerated()), id: \.element) { index, decade in
                                NavigationLink(value: Route.decade(decade)) { tile(decade, hue: Double(index) * 0.17) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .libraryState(model.library.songs.isEmpty, "Nothing to Search", "magnifyingglass")
    }

    private func tile(_ decade: Int, hue: Double) -> some View {
        let hue = (0.93 + hue).truncatingRemainder(dividingBy: 1)
        return Text("\(String(decade))s")
            .font(.title3.bold())
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 100, alignment: .bottomLeading)
            .padding(12)
            .background(
                LinearGradient(
                    colors: [Color(hue: hue, saturation: 0.65, brightness: 0.85), Color(hue: hue, saturation: 0.8, brightness: 0.5)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ),
                in: .rect(cornerRadius: 14)
            )
    }

    @ViewBuilder private var matches: some View {
        if let results, !results.isEmpty || !lyricsHits.isEmpty {
            List {
                if !results.artists.isEmpty {
                    Section("Artists") {
                        ForEach(results.artists) { artist in
                            NavigationLink(value: Route.artist(artist)) {
                                row(artist.coverArt, artist.name, "Artist", symbol: "music.mic", circle: true)
                            }
                        }
                    }
                }
                if !results.albums.isEmpty {
                    Section("Albums") {
                        ForEach(results.albums) { album in
                            NavigationLink(value: Route.album(album)) {
                                row(album.coverArt, album.name, album.artist, symbol: "square.stack")
                            }
                        }
                    }
                }
                if !results.playlists.isEmpty {
                    Section("Playlists") {
                        ForEach(results.playlists) { playlist in
                            NavigationLink(value: Route.playlist(playlist)) {
                                HStack(spacing: 12) {
                                    PlaylistCover(playlist: playlist, size: 120, radius: 6).frame(width: 48, height: 48)
                                    Text(playlist.name).lineLimit(1)
                                }
                            }
                        }
                    }
                }
                if !results.songs.isEmpty {
                    Section("Songs") {
                        ForEach(Array(results.songs.enumerated()), id: \.element.id) { index, _ in
                            SongRow(songs: results.songs, index: index)
                        }
                    }
                }
                if !lyricsHits.isEmpty {
                    Section {
                        ForEach(lyricsHits, id: \.song.id) { lyricsRow($0) }
                    } header: {
                        Text("Lyrics")
                    } footer: {
                        if model.offline { Text("Offline: only lyrics saved on this iPhone are searched.") }
                    }
                }
            }
            .listStyle(.plain)
        } else if answered == term {
            ContentUnavailableView.search(text: query)
        } else {
            ProgressView()
        }
    }

    /// What the phone found first, then what only the server knows.
    private var lyricsHits: [LyricsHit] {
        let local = results?.lyrics ?? []
        guard fromServer.query == term else { return local }
        var seen = Set(local.map(\.song.id))
        return Array((local + fromServer.hits.filter { seen.insert($0.song.id).inserted }).prefix(8))
    }

    private func lyricsRow(_ hit: LyricsHit) -> some View {
        Button {
            remember(query)
            player.start([hit.song])
            if let start = hit.start {
                player.seek(to: (start + Double(lyrics.saved(hit.song.id)?.nudge ?? 0)) / 1000)
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Artwork(id: hit.song.coverArt, size: 120, radius: 6).frame(width: 48, height: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(highlighted(hit.text)).lineLimit(2)
                    Text([hit.song.title, hit.song.artist].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                if let start = hit.start {
                    Text(timeText(start / 1000)).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Plays from this line")
        .contextMenu { SongMenu(song: hit.song) }
    }

    /// The line with the typed words in the accent colour, typos included.
    private func highlighted(_ line: String) -> AttributedString {
        let typed = SearchText.words(SearchQuery(query).text)
        var out = AttributedString()
        for (index, word) in line.split(separator: " ").enumerated() {
            if index > 0 { out += AttributedString(" ") }
            var part = AttributedString(String(word))
            let plain = SearchText.normalize(String(word))
            let vocabulary = [plain: Array(plain)]
            if typed.contains(where: { !SearchText.candidates($0, in: vocabulary).isEmpty }) {
                part.foregroundColor = .accent
                part.inlinePresentationIntent = .stronglyEmphasized
            }
            out += part
        }
        return out
    }

    private func row(_ cover: String?, _ title: String, _ subtitle: String?, symbol: String, circle: Bool = false) -> some View {
        HStack(spacing: 12) {
            Artwork(id: cover, symbol: symbol, size: 120, radius: 6, circle: circle).frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).lineLimit(1)
                if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
            }
        }
    }

    private func buildIndex() {
        // A sync under way replaces the library when it ends; until then the old index will do.
        guard !term.isEmpty, index.value == nil || !model.syncing else { return }
        let library = model.library
        let lyrics = lyrics
        index.want(version) {
            let words = await lyrics.all()
            return await Task.detached {
                SearchIndex(artists: library.artists, albums: library.albums, playlists: library.playlists, songs: library.songs, lyrics: words)
            }.value
        }
    }

    private func search() async {
        let term = term
        guard !term.isEmpty else {
            results = nil
            return
        }
        guard let index = index.value else { return }
        let found = await Task.detached { index.search(SearchQuery(term)) }.value
        guard !Task.isCancelled else { return }
        results = found
        answered = term
    }

    /// The server has the words of songs this phone never opened. Without it, search carries on with what is here.
    private func searchServer() async {
        let term = term
        let parsed = SearchQuery(term)
        guard parsed.filters.isEmpty, parsed.text.count >= 3, !model.needsSignIn, let client = model.client else { return }
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled, let hits = try? await client.searchLyrics(parsed.text), !Task.isCancelled else { return }
        let known = Dictionary(model.library.songs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        fromServer = (term, hits.map { LyricsHit(song: known[$0.song.id] ?? $0.song, start: $0.start, text: $0.text) })
    }

    private func remember(_ term: String) {
        let term = term.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return }
        recentSearches = ([term] + recents.filter { $0 != term }).prefix(6).joined(separator: "\n")
    }
}
