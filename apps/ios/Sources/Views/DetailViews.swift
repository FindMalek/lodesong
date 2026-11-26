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

/// An empty bar until the page's own title has scrolled away under it.
private struct BarTitle: ViewModifier {
    let title: String
    /// How far the page scrolls before its title is gone.
    let after: CGFloat
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > after } action: { _, past in
                withAnimation(.easeInOut(duration: 0.2)) { shown = past }
            }
            // At the top there is nothing to blur, and the blur would draw a band across the artist's picture.
            .scrollEdgeEffectHidden(!shown, for: .top)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(title).font(.headline).lineLimit(1).opacity(shown ? 1 : 0).accessibilityHidden(!shown)
                }
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
        .modifier(BarTitle(title: album.name, after: 310))
        .toolbar {
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
        .modifier(BarTitle(title: playlist.name, after: 310))
        .toolbar {
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

private extension Library {
    /// Newest album first.
    func songs(artist id: String) -> [Song] { albums(artist: id).reversed().flatMap { songs(album: $0.id) } }

    /// Most played first, as the server counts it; unplayed songs keep their album order.
    func topSongs(artist id: String) -> [Song] {
        songs(artist: id).enumerated()
            .sorted { ($1.element.playCount ?? 0, $0.offset) < ($0.element.playCount ?? 0, $1.offset) }
            .map(\.element)
    }
}

/// A full width picture with the name on it, and Shuffle and Play.
private struct ArtistHero: View {
    static let height: CGFloat = 390

    @EnvironmentObject private var player: PlayerModel
    let artist: Artist
    let songs: [Song]

    var body: some View {
        Color.clear
            .frame(height: Self.height)
            .overlay {
                GeometryReader { proxy in
                    let side = max(proxy.size.width, proxy.size.height)
                    Artwork(id: artist.coverArt, symbol: "music.mic", size: 800, radius: 0)
                        .frame(width: side, height: side)
                        .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
                }
            }
            .clipped()
            .overlay { LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .center, endPoint: .bottom) }
            .overlay(alignment: .bottom) {
                HStack(alignment: .bottom, spacing: 12) {
                    Text(artist.name).font(.largeTitle.bold()).foregroundStyle(.white).lineLimit(3)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    button("Shuffle", "shuffle", fill: AnyShapeStyle(.ultraThinMaterial)) { player.startShuffled(songs) }
                    button("Play", "play.fill", fill: AnyShapeStyle(Color.accent)) { player.start(songs) }
                }
                .environment(\.colorScheme, .dark)
                .padding(.horizontal, 20)
                .padding(.bottom, 16)
            }
    }

    private func button(_ title: String, _ symbol: String, fill: AnyShapeStyle, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.title3).foregroundStyle(.white).frame(width: 48, height: 48).background(fill, in: .circle)
        }
        .buttonStyle(.plain)
        .disabled(songs.isEmpty)
        .accessibilityLabel(title)
    }
}

struct ArtistView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var router: Router
    let artist: Artist
    @State private var barHeight: CGFloat = 0

    var body: some View {
        let albums = model.library.albums(artist: artist.id)
        let top = model.library.topSongs(artist: artist.id)
        List {
            ArtistHero(artist: artist, songs: model.library.songs(artist: artist.id))
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
            if !top.isEmpty {
                HStack {
                    heading("Top Songs")
                    Spacer()
                    if top.count > 5 {
                        Button("See All") { router.open(.artistSongs(artist)) }.buttonStyle(.borderless)
                    }
                }
                .padding(.top, 8)
                .listRowSeparator(.hidden, edges: .top)
                ForEach(Array(top.prefix(5).enumerated()), id: \.element.id) { index, _ in
                    SongRow(songs: top, index: index, showsAlbum: true)
                }
            }
            if !albums.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    heading("Albums")
                    LazyVGrid(columns: gridColumns, spacing: 20) {
                        ForEach(albums.reversed()) { AlbumTile(album: $0, section: "artist") }
                    }
                }
                .padding(.top, 12)
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .environment(\.defaultMinListHeaderHeight, 0)
        // The picture runs up under the bar, to the top of the screen.
        .contentMargins(.top, -barHeight, for: .scrollContent)
        .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: { barHeight = $0 }
        .ignoresSafeArea(edges: .top)
        .overlay(alignment: .bottom) {
            if albums.isEmpty { ContentUnavailableView("No Albums", systemImage: "square.stack") }
        }
        .modifier(BarTitle(title: artist.name, after: ArtistHero.height - 110))
    }

    private func heading(_ title: String) -> some View {
        Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
    }
}

/// Every song of one artist, most played first.
struct ArtistSongsView: View {
    @EnvironmentObject private var model: AppModel
    let artist: Artist

    var body: some View {
        let songs = model.library.topSongs(artist: artist.id)
        List {
            ForEach(Array(songs.enumerated()), id: \.element.id) { index, _ in
                SongRow(songs: songs, index: index, showsAlbum: true)
            }
        }
        .listStyle(.plain)
        .navigationTitle("Top Songs")
        .navigationBarTitleDisplayMode(.inline)
    }
}
