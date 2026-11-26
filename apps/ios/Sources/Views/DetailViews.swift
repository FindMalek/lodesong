import SwiftUI

/// Large cover, names, Play and Shuffle: the top of an album or playlist.
private struct DetailHeader<Cover: View, Links: View>: View {
    let title: String
    let caption: String?
    let songs: [Song]
    @ViewBuilder let cover: Cover
    @ViewBuilder let links: Links

    var body: some View {
        VStack(spacing: 6) {
            cover
                .frame(maxWidth: 270)
                .shadow(color: .black.opacity(0.25), radius: 18, y: 10)
                .padding(.bottom, 10)
            Text(title).font(.title2.bold()).multilineTextAlignment(.center)
            links
            if let caption { Text(caption).font(.footnote).foregroundStyle(.secondary) }
            PlayShuffleButtons(songs: songs).padding(.top, 10)
        }
        .frame(maxWidth: .infinity)
    }
}

/// A wash of the cover's colour behind the top of the page.
private struct TopWash: ViewModifier {
    @EnvironmentObject private var model: AppModel
    let cover: String?
    @State private var color: Color = .clear

    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background {
                LinearGradient(colors: [color.opacity(0.55), .clear], startPoint: .top, endPoint: .center)
                    .background(Color(.systemBackground))
                    .ignoresSafeArea()
            }
            .task(id: cover) {
                guard let cover, let palette = await ArtworkCache.shared.palette(cover, client: model.client) else { return }
                withAnimation { color = palette[4] }
            }
    }
}

struct AlbumView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var downloads: DownloadsModel
    @EnvironmentObject private var player: PlayerModel
    let album: Album

    var body: some View {
        let songs = model.library.songs(album: album.id)
        let discs = Dictionary(grouping: Array(songs.enumerated())) { $0.element.discNumber ?? 1 }
        List {
            DetailHeader(title: album.name, caption: album.year.map(String.init), songs: songs) {
                Artwork(id: album.coverArt, size: 600, radius: 14)
            } links: {
                if let artist = model.artist(id: album.artistId) {
                    Button(artist.name) { open(artist) }.font(.title3).buttonStyle(.borderless)
                } else if let name = album.artist {
                    Text(name).font(.title3).foregroundStyle(.secondary)
                }
            }
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            ForEach(discs.keys.sorted(), id: \.self) { disc in
                if discs.count > 1 {
                    Text("Disc \(disc)").font(.headline).foregroundStyle(.secondary).listRowBackground(Color.clear)
                }
                ForEach(discs[disc] ?? [], id: \.element.id) { index, _ in
                    SongRow(songs: songs, index: index, numbered: true).listRowBackground(Color.clear)
                }
            }
            if !songs.isEmpty {
                Text(summaryText(songs)).font(.footnote).foregroundStyle(.secondary)
                    .listRowSeparator(.hidden, edges: .bottom)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .modifier(TopWash(cover: album.coverArt))
        .overlay {
            if songs.isEmpty {
                ContentUnavailableView("No Songs", systemImage: "music.note", description: Text("This album has nothing synced yet."))
            }
        }
        .navigationTitle(album.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("") }
            ToolbarItem {
                DownloadButton(
                    state: downloads.state(album: album.id),
                    keep: { downloads.keep(album: album.id) },
                    remove: { downloads.remove(album: album.id) }
                )
            }
            ToolbarItem {
                Menu("More", systemImage: "ellipsis") {
                    Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext(songs) }
                    Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast(songs) }
                }
            }
        }
    }

    @EnvironmentObject private var router: Router
    private func open(_ artist: Artist) { router.open(.artist(artist)) }
}

struct PlaylistView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var downloads: DownloadsModel
    @EnvironmentObject private var player: PlayerModel
    let playlist: Playlist
    @State private var songs: [Song]?

    var body: some View {
        List {
            DetailHeader(title: playlist.name, caption: songs.map(summaryText), songs: songs ?? []) {
                PlaylistCover(playlist: playlist, size: 600, radius: 14)
            } links: { EmptyView() }
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            if let songs {
                // A playlist may hold the same song twice, so rows are told apart by position.
                ForEach(Array(songs.indices), id: \.self) { index in
                    SongRow(songs: songs, index: index).listRowBackground(Color.clear)
                }
                if songs.isEmpty {
                    ContentUnavailableView("Empty Playlist", systemImage: "music.note.list")
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .modifier(TopWash(cover: playlist.coverArt ?? songs?.first?.coverArt))
        .refreshable { await model.sync() }
        .task(id: model.syncing) { songs = model.entries(playlist: playlist.id) }
        .navigationTitle(playlist.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { Text("") }
            ToolbarItem {
                DownloadButton(
                    state: downloads.state(playlist: playlist.id),
                    keep: { downloads.keep(playlist: playlist.id) },
                    remove: { downloads.remove(playlist: playlist.id) }
                )
            }
            ToolbarItem {
                Menu("More", systemImage: "ellipsis") {
                    Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext(songs ?? []) }
                    Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast(songs ?? []) }
                }
            }
        }
    }
}

struct ArtistView: View {
    @EnvironmentObject private var model: AppModel
    let artist: Artist

    var body: some View {
        let albums = model.library.albums(artist: artist.id)
        let songs = albums.reversed().flatMap { model.library.songs(album: $0.id) }
        List {
            VStack(spacing: 12) {
                Artwork(id: artist.coverArt, symbol: "music.mic", size: 600, circle: true).frame(maxWidth: 200)
                Text(artist.name).font(.largeTitle.bold()).multilineTextAlignment(.center)
                PlayShuffleButtons(songs: songs)
            }
            .frame(maxWidth: .infinity)
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            if !albums.isEmpty {
                Section {
                    LazyVGrid(columns: gridColumns, spacing: 20) {
                        ForEach(albums.reversed()) { AlbumTile(album: $0, section: "artist") }
                    }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                } header: {
                    Text("Albums").font(.title2.bold()).foregroundStyle(Color.primary)
                }
                Section {
                    ForEach(Array(songs.prefix(8).enumerated()), id: \.element.id) { index, _ in
                        SongRow(songs: songs, index: index).listRowBackground(Color.clear)
                    }
                } header: {
                    Text("Songs").font(.title2.bold()).foregroundStyle(Color.primary)
                }
            }
        }
        .listStyle(.plain)
        .modifier(TopWash(cover: artist.coverArt))
        .overlay(alignment: .bottom) {
            if albums.isEmpty { ContentUnavailableView("No Albums", systemImage: "square.stack") }
        }
        .navigationTitle(artist.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .principal) { Text("") } }
    }
}
