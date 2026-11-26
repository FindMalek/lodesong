import SwiftUI

/// The rows and the grid on the Library page, each of which Settings can hide.
enum LibrarySection: String, CaseIterable {
    case playlists, artists, albums, songs, downloaded, recentlyAdded

    var title: String { self == .recentlyAdded ? "Recently Added" : rawValue.capitalized }
}

struct LibraryView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage(Pref.hiddenLibrary) private var hidden = ""

    private func shows(_ section: LibrarySection) -> Bool { !hidden.split(separator: ",").contains(Substring(section.rawValue)) }

    private var added: [Album] { Array(model.library.albums.sorted { ($0.created ?? "") > ($1.created ?? "") }.prefix(30)) }

    var body: some View {
        List {
            if model.offline {
                OfflineNotice().listRowSeparator(.hidden)
            }
            if shows(.playlists) { row("Playlists", "music.note.list", .playlists) }
            if shows(.artists) { row("Artists", "music.mic", .artists) }
            if shows(.albums) { row("Albums", "square.stack", .albums) }
            if shows(.songs) { row("Songs", "music.note", .songs) }
            if shows(.downloaded) { row("Downloaded", "arrow.down.circle", .downloaded) }
            if shows(.recentlyAdded), !added.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Recently Added").font(.title2.bold())
                    LazyVGrid(columns: gridColumns, spacing: 20) {
                        ForEach(added) { AlbumTile(album: $0, section: "library") }
                    }
                }
                .padding(.top, 20)
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .refreshable { await model.sync() }
        .libraryState(model.library.songs.isEmpty, "No Music Yet", "music.note.list")
        .navigationTitle("Library")
        .toolbarTitleDisplayMode(.inlineLarge)
        .toolbar {
            if model.syncing {
                ToolbarItem { ProgressView() }
            }
            ToolbarItem { AccountButton() }
        }
    }

    private func row(_ title: String, _ symbol: String, _ route: Route) -> some View {
        NavigationLink(value: route) {
            Label {
                Text(title).font(.title3)
            } icon: {
                Image(systemName: symbol).foregroundStyle(.tint)
            }
        }
    }
}

struct PlaylistsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            LazyVGrid(columns: gridColumns, spacing: 20) {
                ForEach(model.library.playlists) { PlaylistTile(playlist: $0) }
            }
            .padding(20)
        }
        .refreshable { await model.sync() }
        .libraryState(model.library.playlists.isEmpty, "No Playlists", "music.note.list")
        .navigationTitle("Playlists")
    }
}

struct AlbumsView: View {
    @EnvironmentObject private var model: AppModel
    var decade: Int?
    @AppStorage("albumSort") private var sort = "title"
    @State private var filter = ""

    private var albums: [Album] {
        var albums = model.library.albums
        if let decade { albums = albums.filter { ($0.year ?? 0) / 10 * 10 == decade } }
        if !filter.isEmpty {
            albums = albums.filter { $0.name.localizedStandardContains(filter) || ($0.artist ?? "").localizedStandardContains(filter) }
        }
        switch sort {
        case "artist": return albums.sorted { ($0.artist ?? "").localizedStandardCompare($1.artist ?? "") == .orderedAscending }
        case "year": return albums.sorted { ($0.year ?? 0) > ($1.year ?? 0) }
        default: return albums.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        }
    }

    var body: some View {
        let shown = albums
        ScrollView {
            LazyVGrid(columns: gridColumns, spacing: 20) {
                ForEach(shown) { AlbumTile(album: $0) }
            }
            .padding(20)
        }
        .refreshable { await model.sync() }
        .searchable(text: $filter, prompt: "Find in Albums")
        .overlay { if shown.isEmpty && !filter.isEmpty { ContentUnavailableView.search(text: filter) } }
        .libraryState(model.library.albums.isEmpty, "No Albums", "square.stack")
        .navigationTitle(decade.map { "\($0)s" } ?? "Albums")
        .toolbar {
            Menu("Sort", systemImage: "arrow.up.arrow.down") {
                Picker("Sort", selection: $sort) {
                    Text("Title").tag("title")
                    Text("Artist").tag("artist")
                    Text("Newest First").tag("year")
                }
            }
        }
    }
}

/// Splits names into A to Z groups for the index down the side, with everything else last.
private func lettered<Item>(_ items: [Item], _ name: (Item) -> String) -> [(letter: String, items: [Item])] {
    let groups = Dictionary(grouping: items) { item -> String in
        let first = name(item).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).uppercased().first
        return first.map { $0.isLetter ? String($0) : "#" } ?? "#"
    }
    return groups.keys.sorted { ($0 == "#" ? 1 : 0, $0) < ($1 == "#" ? 1 : 0, $1) }.map { letter in
        (letter, groups[letter]!.sorted { name($0).localizedStandardCompare(name($1)) == .orderedAscending })
    }
}

struct ArtistsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var filter = ""

    private var artists: [Artist] {
        filter.isEmpty ? model.library.artists : model.library.artists.filter { $0.name.localizedStandardContains(filter) }
    }

    var body: some View {
        let groups = lettered(artists, \.name)
        List {
            ForEach(groups, id: \.letter) { group in
                Section(group.letter) {
                    ForEach(group.items) { artist in
                        NavigationLink(value: Route.artist(artist)) {
                            HStack(spacing: 12) {
                                Artwork(id: artist.coverArt, symbol: "music.mic", size: 120, circle: true).frame(width: 48, height: 48)
                                Text(artist.name).lineLimit(1)
                            }
                        }
                    }
                }
                .sectionIndexLabel(group.letter)
            }
        }
        .listStyle(.plain)
        .listSectionIndexVisibility(.visible)
        .refreshable { await model.sync() }
        .searchable(text: $filter, prompt: "Find in Artists")
        .overlay { if groups.isEmpty && !filter.isEmpty { ContentUnavailableView.search(text: filter) } }
        .libraryState(model.library.artists.isEmpty, "No Artists", "music.mic")
        .navigationTitle("Artists")
    }
}

struct SongsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var filter = ""
    @State private var songs: [Song] = []
    @State private var groups: [(letter: String, items: [(index: Int, song: Song)])] = []

    var body: some View {
        List {
            if filter.isEmpty && !songs.isEmpty {
                PlayShuffleButtons(songs: songs).listRowSeparator(.hidden)
            }
            ForEach(groups, id: \.letter) { group in
                Section(group.letter) {
                    ForEach(group.items, id: \.song.id) { item in
                        SongRow(songs: songs, index: item.index)
                    }
                }
                .sectionIndexLabel(group.letter)
            }
        }
        .listStyle(.plain)
        .listSectionIndexVisibility(.visible)
        .refreshable { await model.sync() }
        .searchable(text: $filter, prompt: "Find in Songs")
        .overlay { if songs.isEmpty && !filter.isEmpty { ContentUnavailableView.search(text: filter) } }
        .libraryState(model.library.songs.isEmpty, "No Songs", "music.note")
        .navigationTitle("Songs")
        // Sorting thousands of songs on every redraw would stutter, so it happens only when the input changes.
        .task(id: [filter, String(model.library.songs.count), String(model.syncing)]) {
            let matches = filter.isEmpty ? model.library.songs : model.library.songs.filter {
                $0.title.localizedStandardContains(filter) || ($0.artist ?? "").localizedStandardContains(filter)
            }
            let sections = lettered(matches, \.title)
            songs = sections.flatMap(\.items)
            var next = 0
            groups = sections.map { section in
                let items = section.items.map { song in
                    defer { next += 1 }
                    return (index: next, song: song)
                }
                return (section.letter, items)
            }
        }
    }
}

struct DownloadedView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var downloads: DownloadsModel

    private var albums: [Album] { model.library.albums.filter { downloads.state(album: $0.id) != .none } }
    private var playlists: [Playlist] { model.library.playlists.filter { downloads.state(playlist: $0.id) != .none } }

    var body: some View {
        let albums = albums
        let playlists = playlists
        ScrollView {
            LazyVGrid(columns: gridColumns, spacing: 20) {
                ForEach(playlists) { PlaylistTile(playlist: $0) }
                ForEach(albums) { AlbumTile(album: $0) }
            }
            .padding(20)
        }
        .overlay {
            if albums.isEmpty && playlists.isEmpty {
                ContentUnavailableView(
                    "Nothing Downloaded", systemImage: "arrow.down.circle",
                    description: Text("Download an album or playlist to play it with no network.")
                )
            }
        }
        .navigationTitle("Downloaded")
        .toolbar {
            NavigationLink { DownloadsView() } label: { Label("Download Settings", systemImage: "gearshape") }
        }
    }
}
