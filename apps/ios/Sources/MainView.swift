import SwiftUI

struct MainView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        TabView {
            Tab("Library", systemImage: "music.note.list") {
                NavigationStack { LibraryView() }
            }
            Tab(role: .search) {
                NavigationStack { SearchView() }
            }
        }
    }
}

struct LibraryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            NavigationLink { PlaylistsView() } label: { Label("Playlists", systemImage: "music.note.list") }
            NavigationLink { ArtistsView() } label: { Label("Artists", systemImage: "music.mic") }
            NavigationLink { AlbumsView(title: "Albums", albums: model.library.albums) } label: { Label("Albums", systemImage: "square.stack") }
            NavigationLink { SongsView(title: "Songs", songs: model.library.songs) } label: { Label("Songs", systemImage: "music.note") }
            if let error = model.syncError {
                Section("Offline") { Text(error).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Library")
        .refreshable { await model.sync() }
        .toolbar {
            if model.syncing {
                ToolbarItem { ProgressView() }
            }
            ToolbarItem {
                Menu("Account", systemImage: "person.crop.circle") {
                    Text(model.user)
                    Button("Sync Now", systemImage: "arrow.clockwise") { Task { await model.sync() } }
                    Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive, action: model.signOut)
                }
            }
        }
        .overlay {
            if model.library.songs.isEmpty && model.syncing {
                ProgressView("Getting your library…")
            }
        }
    }
}

struct PlaylistsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List(model.library.playlists) { playlist in
            NavigationLink {
                SongsView(title: playlist.name, songs: model.entries(playlist: playlist.id))
            } label: {
                Row(cover: playlist.coverArt, title: playlist.name, subtitle: playlist.songCount.map { "\($0) songs" })
            }
        }
        .navigationTitle("Playlists")
        .overlay { if model.library.playlists.isEmpty { ContentUnavailableView("No Playlists", systemImage: "music.note.list") } }
    }
}

struct ArtistsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List(model.library.artists) { artist in
            NavigationLink(artist.name) {
                AlbumsView(title: artist.name, albums: model.library.albums(artist: artist.id))
            }
        }
        .navigationTitle("Artists")
        .overlay { if model.library.artists.isEmpty { ContentUnavailableView("No Artists", systemImage: "music.mic") } }
    }
}

struct AlbumsView: View {
    @EnvironmentObject private var model: AppModel
    let title: String
    let albums: [Album]

    var body: some View {
        List(albums) { album in
            NavigationLink {
                SongsView(title: album.name, songs: model.library.songs(album: album.id))
            } label: {
                Row(cover: album.coverArt, title: album.name, subtitle: album.artist)
            }
        }
        .navigationTitle(title)
        .overlay { if albums.isEmpty { ContentUnavailableView("No Albums", systemImage: "square.stack") } }
    }
}

struct SongsView: View {
    let title: String
    let songs: [Song]

    var body: some View {
        List(Array(songs.enumerated()), id: \.offset) { _, song in
            Row(cover: song.coverArt, title: song.title, subtitle: song.artist)
        }
        .navigationTitle(title)
        .overlay { if songs.isEmpty { ContentUnavailableView("No Songs", systemImage: "music.note") } }
    }
}

struct SearchView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = ""

    private var matches: [Song] {
        guard !query.isEmpty else { return [] }
        return model.library.songs.filter { $0.title.localizedStandardContains(query) || ($0.artist ?? "").localizedStandardContains(query) }
    }

    var body: some View {
        List(matches) { song in
            Row(cover: song.coverArt, title: song.title, subtitle: song.artist)
        }
        .navigationTitle("Search")
        .searchable(text: $query, prompt: "Songs and artists")
    }
}

struct Row: View {
    @EnvironmentObject private var model: AppModel
    let cover: String?
    let title: String
    let subtitle: String?

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: cover.flatMap { model.client?.coverURL($0, size: 120) }) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color.secondary.opacity(0.15)
            }
            .frame(width: 44, height: 44)
            .clipShape(.rect(cornerRadius: 6))
            VStack(alignment: .leading) {
                Text(title).lineLimit(1)
                if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
            }
        }
    }
}
