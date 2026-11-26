import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = SearchView.initialQuery
    @State private var results: Results?
    @AppStorage("recentSearches") private var recentSearches = ""

    private static var initialQuery: String {
        #if DEBUG
        ProcessInfo.processInfo.environment["LODESONG_QUERY"] ?? ""
        #else
        ""
        #endif
    }

    struct Results {
        var query = ""
        var artists: [Artist] = []
        var albums: [Album] = []
        var playlists: [Playlist] = []
        var songs: [Song] = []
        var isEmpty: Bool { artists.isEmpty && albums.isEmpty && playlists.isEmpty && songs.isEmpty }
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
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Artists, Songs, Albums and More")
        .autocorrectionDisabled()
        .onSubmit(of: .search) { remember(query) }
        .task(id: [query, String(model.library.songs.count), String(model.syncing)]) { search(query.trimmingCharacters(in: .whitespaces)) }
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
        if let results, !results.isEmpty {
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
            }
            .listStyle(.plain)
        } else if results?.query == query.trimmingCharacters(in: .whitespaces) {
            ContentUnavailableView.search(text: query)
        } else {
            ProgressView()
        }
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

    private func search(_ term: String) {
        guard !term.isEmpty else {
            results = nil
            return
        }
        let library = model.library
        let hit = { (text: String?) in text?.localizedStandardContains(term) ?? false }
        results = Results(
            query: term,
            artists: Array(library.artists.filter { hit($0.name) }.prefix(5)),
            albums: Array(library.albums.filter { hit($0.name) || hit($0.artist) }.prefix(8)),
            playlists: Array(library.playlists.filter { hit($0.name) }.prefix(5)),
            songs: Array(library.songs.filter { hit($0.title) || hit($0.artist) }.prefix(50))
        )
    }

    private func remember(_ term: String) {
        let term = term.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return }
        recentSearches = ([term] + recents.filter { $0 != term }).prefix(6).joined(separator: "\n")
    }
}
