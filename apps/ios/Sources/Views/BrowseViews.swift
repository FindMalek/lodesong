import SwiftUI

struct GenresView: View {
    @EnvironmentObject private var model: AppModel
    @State private var genres: [(name: String, count: Int)] = []
    @State private var filter = ""

    var body: some View {
        let shown = genres.filter { filter.isEmpty || $0.name.localizedStandardContains(filter) }
        List(shown, id: \.name) { genre in
            NavigationLink(value: Route.genre(genre.name)) {
                LabeledContent {
                    Text(genre.count.formatted())
                } label: {
                    Text(genre.name).font(.title3).lineLimit(1)
                }
            }
        }
        .listStyle(.plain)
        .refreshable { await model.sync() }
        .searchable(text: $filter, prompt: "Find in Genres")
        .overlay {
            if genres.isEmpty {
                ContentUnavailableView("No Genres", systemImage: "guitars", description: Text("None of your songs are tagged with a genre."))
            } else if shown.isEmpty {
                ContentUnavailableView.search(text: filter)
            }
        }
        .navigationTitle("Genres")
        .task(id: model.libraryRevision) { genres = genreList(model.browse.songs).map { ($0.name, $0.songs.count) } }
    }
}

/// One genre: play or shuffle its songs, and every album that has one.
struct GenreView: View {
    @EnvironmentObject private var model: AppModel
    let name: String
    @State private var songs: [Song] = []
    @State private var albums: [Album] = []

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                PlayShuffleButtons(songs: songs)
                LazyVGrid(columns: gridColumns, spacing: 20) {
                    ForEach(albums) { AlbumTile(album: $0, section: "genre") }
                }
            }
            .padding(20)
        }
        .navigationTitle(name)
        .task(id: model.libraryRevision) {
            let found = model.browse.songs.filter { $0.genreNames.contains(name) }
            let ids = Set(found.compactMap(\.albumId))
            albums = model.browse.albums.filter { ids.contains($0.id) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            // Album by album, in track order, as Play should go through them.
            songs = SongSort.album.sorted(found)
        }
    }
}

/// Hands over what is liked now: what the library says, and what was changed on this phone since.
private struct Favorites<Content: View>: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @State private var changes: [MarkChange] = []
    @ViewBuilder let content: (_ liked: (Song) -> Bool) -> Content

    var body: some View {
        // The same key `PlayerModel` files marks under.
        let account = "\(model.client?.identity.absoluteString ?? "") \(model.user)"
        let likes = Dictionary(
            changes.filter { $0.account == account && $0.kind == .like }.map { ($0.song, $0.value != 0) },
            uniquingKeysWith: { _, last in last }
        )
        content { likes[$0.id] ?? ($0.starred != nil) }
            .refreshable { await model.sync() }
            .onAppear(perform: read)
            // A like changed from a row here must take it off the page; the player says when something moved.
            .onReceive(player.objectWillChange) { _ in DispatchQueue.main.async(execute: read) }
    }

    private func read() {
        let now = SongMarks(folder: .applicationSupportDirectory).changes
        if now != changes { changes = now }
    }
}

private struct NoFavorites: View {
    let what: String

    var body: some View {
        ContentUnavailableView("No Favorite \(what)", systemImage: "heart", description: Text("Like \(what.lowercased()) and they show here."))
    }
}

struct FavoriteSongsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Favorites { liked in
            let songs = SongSort.title.sorted(model.browse.songs.filter(liked))
            List {
                if !songs.isEmpty {
                    PlayShuffleButtons(songs: songs).listRowSeparator(.hidden)
                }
                ForEach(Array(songs.enumerated()), id: \.element.id) { index, _ in
                    SongRow(songs: songs, index: index)
                }
            }
            .listStyle(.plain)
            .overlay { if songs.isEmpty { NoFavorites(what: "Songs") } }
        }
        .navigationTitle("Favorite Songs")
    }
}

struct FavoriteAlbumsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Favorites { liked in
            let albums = model.browse.albums.filter { liked($0.markable) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            ScrollView {
                LazyVGrid(columns: gridColumns, spacing: 20) {
                    ForEach(albums) { AlbumTile(album: $0, section: "favorites") }
                }
                .padding(20)
            }
            .overlay { if albums.isEmpty { NoFavorites(what: "Albums") } }
        }
        .navigationTitle("Favorite Albums")
    }
}

struct FavoriteArtistsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Favorites { liked in
            let artists = model.browse.artists.filter { liked($0.markable) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            List(artists) { ArtistRow(artist: $0) }
                .listStyle(.plain)
                .overlay { if artists.isEmpty { NoFavorites(what: "Artists") } }
        }
        .navigationTitle("Favorite Artists")
    }
}
