import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage(Pref.hiddenLibrary) private var hidden = ""
    @AppStorage(Pref.libraryOrder) private var order = ""

    private func shows(_ section: LibrarySection) -> Bool { !hidden.split(separator: ",").contains(Substring(section.rawValue)) }

    @State private var folders: [MusicFolder] = []

    private var added: [Album] { Array(model.browse.albums.sorted { ($0.created ?? "") > ($1.created ?? "") }.prefix(30)) }

    var body: some View {
        List {
            if model.offline {
                OfflineNotice().listRowSeparator(.hidden)
            }
            ForEach(LibrarySection.ordered(order).filter(shows), id: \.self) { section($0) }
        }
        .listStyle(.plain)
        .refreshable { await model.sync() }
        .libraryState(model.library.songs.isEmpty, "No Music Yet", "music.note.list")
        // Offline or refused, the last answer stays.
        .task(id: [model.live?.server.absoluteString ?? "", model.user]) {
            if let found = try? await model.live?.musicFolders() { folders = found }
        }
        .navigationTitle("Library")
        .toolbarTitleDisplayMode(.inlineLarge)
        .toolbar {
            if model.syncing {
                ToolbarItem { ProgressView() }
            }
            if folders.count > 1 || model.library.folder != nil {
                ToolbarItem { folderMenu }
            }
            ToolbarItem { AccountButton() }
        }
    }

    private var folderMenu: some View {
        let chosen = model.library.folder
        // The chosen one stays listed when the server can't be asked.
        let listed = folders.isEmpty ? chosen.map { [MusicFolder(id: $0.id, name: $0.name)] } ?? [] : folders
        return Menu("Music Folder", systemImage: chosen == nil ? "folder" : "folder.fill") {
            Picker("Music Folder", selection: Binding { chosen?.id ?? "" } set: { id in choose(listed.first { $0.id == id }) }) {
                Text("All Music").tag("")
                ForEach(listed) { Text($0.name).tag($0.id) }
            }
        }
    }

    private func choose(_ folder: MusicFolder?) {
        Haptic.tap()
        Task {
            do {
                try await model.chooseFolder(folder)
            } catch {
                Popup.show("Can't Change Folder", message: error.localizedDescription)
            }
        }
    }

    @ViewBuilder private func section(_ section: LibrarySection) -> some View {
        switch section {
        case .playlists: row("Playlists", "music.note.list", .playlists)
        case .artists: row("Artists", "music.mic", .artists)
        case .albums: row("Albums", "square.stack", .albums)
        case .songs: row("Songs", "music.note", .songs)
        case .genres: row(section.title, "guitars", .genres)
        case .favoriteSongs: row(section.title, "heart", .favoriteSongs)
        case .favoriteAlbums: row(section.title, "heart.square", .favoriteAlbums)
        case .favoriteArtists: row(section.title, "heart.circle", .favoriteArtists)
        case .downloaded: row("Downloaded", "arrow.down.circle", .downloaded)
        case .recentlyAdded:
            let albums = added
            if !albums.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Recently Added").font(.title2.bold())
                    LazyVGrid(columns: gridColumns, spacing: 20) {
                        ForEach(albums) { AlbumTile(album: $0, section: "library") }
                    }
                }
                .padding(.top, 20)
                .listRowSeparator(.hidden)
            }
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

struct AlbumsView: View {
    @EnvironmentObject private var model: AppModel
    var decade: Int?
    @AppStorage("albumSort") private var sort = "title"
    @State private var filter = ""

    private var albums: [Album] {
        var albums = model.browse.albums
        if let decade { albums = albums.filter { ($0.year ?? 0) / 10 * 10 == decade } }
        if !filter.isEmpty {
            albums = albums.filter { $0.name.localizedStandardContains(filter) || ($0.artist ?? "").localizedStandardContains(filter) }
        }
        switch sort {
        case "artist": return albums.sorted { ($0.artist ?? "").localizedStandardCompare($1.artist ?? "") == .orderedAscending }
        case "year": return albums.sorted { ($0.year ?? 0) > ($1.year ?? 0) }
        case "added": return albums.sorted { ($0.created ?? "") > ($1.created ?? "") }
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
        .libraryState(model.browse.albums.isEmpty, "No Albums", "square.stack")
        .navigationTitle(decade.map { "\($0)s" } ?? "Albums")
        .toolbar {
            Menu("Sort", systemImage: "arrow.up.arrow.down") {
                Picker("Sort", selection: $sort) {
                    Text("Title").tag("title")
                    Text("Artist").tag("artist")
                    Text("Release Year").tag("year")
                    Text("Date Added").tag("added")
                }
            }
        }
    }
}

/// Splits names into A to Z groups for the index down the side, with everything else last. Songs keep their order inside a letter.
private func lettered<Item>(_ items: [Item], _ name: (Item) -> String) -> [(letter: String, items: [Item])] {
    let groups = Dictionary(grouping: items) { item -> String in
        let first = name(item).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current).uppercased().first
        return first.map { $0.isLetter ? String($0) : "#" } ?? "#"
    }
    return groups.keys.sorted { ($0 == "#" ? 1 : 0, $0) < ($1 == "#" ? 1 : 0, $1) }.map { letter in
        (letter, groups[letter]!)
    }
}

struct ArtistRow: View {
    let artist: Artist

    var body: some View {
        NavigationLink(value: Route.artist(artist)) {
            HStack(spacing: 12) {
                Artwork(id: artist.coverArt, symbol: "music.mic", size: 120, circle: true).frame(width: 48, height: 48)
                Text(artist.name).lineLimit(1)
            }
        }
        .contextMenu { ArtistMenu(artist: artist) }
    }
}

struct ArtistsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var filter = ""

    private var artists: [Artist] {
        filter.isEmpty ? model.browse.artists : model.browse.artists.filter { $0.name.localizedStandardContains(filter) }
    }

    var body: some View {
        let groups = lettered(artists.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }, \.name)
        List {
            ForEach(groups, id: \.letter) { group in
                Section(group.letter) {
                    ForEach(group.items) { ArtistRow(artist: $0) }
                }
                .sectionIndexLabel(group.letter)
            }
        }
        .listStyle(.plain)
        .listSectionIndexVisibility(.visible)
        .refreshable { await model.sync() }
        .searchable(text: $filter, prompt: "Find in Artists")
        .overlay { if groups.isEmpty && !filter.isEmpty { ContentUnavailableView.search(text: filter) } }
        .libraryState(model.browse.artists.isEmpty, "No Artists", "music.mic")
        .navigationTitle("Artists")
    }
}

struct SongsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @AppStorage("songSort") private var sort = SongSort.title
    @State private var filter = ""
    @State private var songs: [Song] = []
    @State private var groups: [(letter: String, items: [(index: Int, song: Song)])] = []

    /// Only names have an A to Z; the other orders are one long list.
    private var indexed: Bool { sort == .title || sort == .artist }

    var body: some View {
        List {
            if filter.isEmpty && !songs.isEmpty {
                PlayShuffleButtons(songs: songs).listRowSeparator(.hidden)
            }
            ForEach(groups, id: \.letter) { group in
                if indexed {
                    Section(group.letter) { rows(group.items) }
                        .sectionIndexLabel(group.letter)
                } else {
                    rows(group.items)
                }
            }
        }
        .listStyle(.plain)
        .listSectionIndexVisibility(indexed ? .visible : .hidden)
        .refreshable { await model.sync() }
        .searchable(text: $filter, prompt: "Find in Songs")
        .overlay { if songs.isEmpty && !filter.isEmpty { ContentUnavailableView.search(text: filter) } }
        .libraryState(model.browse.songs.isEmpty, "No Songs", "music.note")
        .navigationTitle("Songs")
        .toolbar {
            Menu("Sort", systemImage: "arrow.up.arrow.down") {
                Picker("Sort", selection: $sort) {
                    ForEach(SongSort.allCases.filter { $0 != .server }, id: \.self) { Text($0.label).tag($0) }
                }
            }
            Button("Select", systemImage: "checkmark.circle") {
                let songs = songs
                SheetPresenter.show(model, player) { SelectSongsView(songs: songs) }
            }
            .disabled(songs.isEmpty)
        }
        // Sorting thousands of songs on every redraw would stutter, so it happens only when the input changes.
        .task(id: [filter, sort.rawValue, String(model.libraryRevision), String(model.syncing)]) { arrange() }
    }

    private func rows(_ items: [(index: Int, song: Song)]) -> some View {
        ForEach(items, id: \.song.id) { item in
            SongRow(songs: songs, index: item.index)
        }
    }

    private func arrange() {
        let all = model.browse.songs
        let matches = filter.isEmpty ? all : all.filter {
            $0.title.localizedStandardContains(filter) || ($0.artist ?? "").localizedStandardContains(filter)
        }
        let sorted = sort.sorted(matches)
        let sections: [(letter: String, items: [Song])]
        switch sort {
        case .title: sections = lettered(sorted, \.title)
        case .artist: sections = lettered(sorted) { $0.artist ?? "" }
        default: sections = [("", sorted)]
        }
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
