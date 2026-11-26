import SwiftUI

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
    @EnvironmentObject private var router: Router
    let album: Album
    @State private var query = ""
    @FocusState private var searching: Bool

    var body: some View {
        let songs = model.library.songs(album: album.id)
        let found = songs.indices.filter { query.isEmpty || songs[$0].matches(query) }
        let discs = Dictionary(grouping: found) { songs[$0].discNumber ?? 1 }
        List {
            CollectionSearch(prompt: "Find in Album", query: $query, focused: $searching)
            if !searching && query.isEmpty {
                CollectionHeader(
                    title: album.name, description: nil,
                    details: [album.year.map(String.init), songs.isEmpty ? nil : summaryText(songs)].compactMap { $0 }.joined(separator: " · "),
                    songs: songs,
                    download: DownloadControl(
                        state: downloads.state(album: album.id), songs: songs, follows: false,
                        keep: { downloads.keep(album: album.id) }, remove: { downloads.remove(album: album.id) }
                    )
                ) {
                    Artwork(id: album.coverArt, size: 600, radius: 14)
                } byline: {
                    if let artist = model.artist(id: album.artistId) {
                        Button(artist.name) { router.open(.artist(artist)) }.buttonStyle(.borderless)
                    } else if let name = album.artist {
                        Text(name).foregroundStyle(.secondary)
                    }
                }
            }
            // Disc headings only make sense over the whole album.
            ForEach(discs.keys.sorted(), id: \.self) { disc in
                if discs.count > 1 && query.isEmpty {
                    Text("Disc \(disc)").font(.headline).foregroundStyle(.secondary).listRowBackground(Color.clear)
                }
                ForEach(discs[disc] ?? [], id: \.self) { index in
                    SongRow(songs: songs, index: index, numbered: true).listRowBackground(Color.clear)
                }
            }
            if songs.isEmpty {
                ContentUnavailableView("No Songs", systemImage: "music.note", description: Text("This album has nothing synced yet."))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else if found.isEmpty {
                ContentUnavailableView.search(text: query).listRowSeparator(.hidden).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollDismissesKeyboard(.immediately)
        .modifier(TopWash(cover: album.coverArt))
        .modifier(BarTitle(title: album.name, after: 380))
        .modifier(CollectionMenu(kind: "album", id: album.id, songs: songs, sort: nil))
    }
}

struct PlaylistView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var downloads: DownloadsModel
    let playlist: Playlist
    @Environment(\.dismiss) private var dismiss
    @State private var songs: [Song]?
    @State private var query = ""
    @FocusState private var searching: Bool
    @AppStorage private var sort: SongSort

    init(playlist: Playlist) {
        self.playlist = playlist
        _sort = AppStorage(wrappedValue: .server, Pref.playlistSongSort + playlist.id)
    }

    /// The route holds the playlist as it was when opened; a sync may have renamed it or changed its description.
    private var current: Playlist { model.library.playlists.first { $0.id == playlist.id } ?? playlist }

    var body: some View {
        let playlist = current
        let ordered = sort.sorted(songs ?? [])
        // A playlist may hold the same song twice, so rows are told apart by position.
        let found = ordered.indices.filter { query.isEmpty || ordered[$0].matches(query) }
        List {
            CollectionSearch(prompt: "Find in Playlist", query: $query, focused: $searching)
            if !searching && query.isEmpty {
                CollectionHeader(
                    title: playlist.name, description: playlist.comment, details: songs.map(summaryText) ?? "", songs: ordered,
                    download: DownloadControl(
                        state: downloads.state(playlist: playlist.id), songs: ordered, follows: downloads.takesNewSongs(playlist: playlist.id),
                        keep: { downloads.keep(playlist: playlist.id) }, remove: { downloads.remove(playlist: playlist.id) }
                    )
                ) {
                    PlaylistCover(playlist: playlist, size: 600, radius: 14)
                } byline: {
                    if let owner = playlist.owner, !owner.isEmpty {
                        Text("by \(owner)").foregroundStyle(.secondary)
                    }
                }
            }
            if let songs {
                ForEach(found, id: \.self) { index in
                    SongRow(songs: ordered, index: index, remove: remover(index, ordered: ordered, in: playlist)).listRowBackground(Color.clear)
                }
                if songs.isEmpty {
                    ContentUnavailableView("Empty Playlist", systemImage: "music.note.list")
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                } else if found.isEmpty {
                    ContentUnavailableView.search(text: query).listRowSeparator(.hidden).listRowBackground(Color.clear)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollDismissesKeyboard(.immediately)
        .modifier(TopWash(cover: playlist.coverArt ?? songs?.first?.coverArt))
        .refreshable { await model.sync() }
        .task(id: model.libraryRevision) { songs = model.entries(playlist: playlist.id) }
        // Deleted from here or elsewhere: there is no page left to show.
        .onChange(of: model.libraryRevision) {
            if !model.library.playlists.contains(where: { $0.id == playlist.id }) { dismiss() }
        }
        .modifier(BarTitle(title: playlist.name, after: 380))
        .modifier(CollectionMenu(kind: "playlist", id: playlist.id, songs: ordered, sort: $sort))
    }

    /// Rows may be sorted; the server removes by the place in the playlist's own order.
    private func remover(_ index: Int, ordered: [Song], in playlist: Playlist) -> (() -> Void)? {
        guard playlist.editable(by: model.user), let songs else { return nil }
        return {
            let id = ordered[index].id
            // Sorting keeps equal songs in order, so the n-th copy shown is the n-th copy in the playlist.
            let nth = ordered[..<index].filter { $0.id == id }.count
            let places = songs.indices.filter { songs[$0].id == id }
            guard places.indices.contains(nth) else { return }
            PlaylistActions.remove(at: places[nth], of: songs, from: playlist, model: model)
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
                    button("Play", "play.fill", fill: AnyShapeStyle(.tint)) { player.start(songs) }
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

/// The parts of an artist's page below the picture, in the order they were left in.
private enum ArtistSection: String, CaseIterable {
    case topSongs, albums, eps, singles, live, compilations, other, about

    static let key = "artistSections"

    var title: String { release?.title ?? (self == .topSongs ? "Top Songs" : "About") }

    var release: ReleaseKind? {
        switch self {
        case .topSongs, .about: return nil
        case .albums: return .album
        case .eps: return .ep
        case .singles: return .single
        case .live: return .live
        case .compilations: return .compilation
        case .other: return .other
        }
    }
}

private struct ArtistSectionOrder: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(ArtistSection.key) private var order = ""

    var body: some View {
        let sections: [ArtistSection] = storedOrder(order)
        NavigationStack {
            List {
                ForEach(sections, id: \.self) { Text($0.title) }
                    .onMove { source, target in
                        var moved = sections
                        moved.move(fromOffsets: source, toOffset: target)
                        order = moved.map(\.rawValue).joined(separator: ",")
                    }
                Button("Reset to Default") { order = "" }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Reorder Sections")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
        }
    }
}

struct ArtistView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var router: Router
    let artist: Artist
    @State private var barHeight: CGFloat = 0
    @State private var biography: String?
    @State private var wholeBiography = false
    @State private var reordering = false
    @AppStorage(ArtistSection.key) private var order = ""

    var body: some View {
        let albums = model.library.albums(artist: artist.id)
        let top = model.library.topSongs(artist: artist.id)
        let sections: [ArtistSection] = storedOrder(order)
        List {
            ArtistHero(artist: artist, songs: model.library.songs(artist: artist.id))
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
            ForEach(sections, id: \.self) { section in
                if let kind = section.release {
                    releases(kind.title, albums.reversed().filter { $0.releaseKind == kind })
                } else if section == .topSongs {
                    topSongs(top)
                } else {
                    about
                }
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
        .toolbar {
            ToolbarItem {
                Menu("More", systemImage: "ellipsis") {
                    ArtistMenu(artist: model.artist(id: artist.id) ?? artist)
                    Divider()
                    Button("Reorder Sections", systemImage: "arrow.up.arrow.down") { reordering = true }
                }
            }
        }
        .sheet(isPresented: $reordering) { ArtistSectionOrder() }
        // Asked each time and not kept: with no network the page does without it.
        .task(id: model.live?.server) {
            if let text = try? await model.live?.biography(artist: artist.id) { biography = text }
        }
    }

    @ViewBuilder private func topSongs(_ top: [Song]) -> some View {
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
    }

    @ViewBuilder private func releases(_ title: String, _ albums: [Album]) -> some View {
        if !albums.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                heading(title)
                LazyVGrid(columns: gridColumns, spacing: 20) {
                    ForEach(albums) { AlbumTile(album: $0, section: "artist") }
                }
            }
            .padding(.top, 12)
            .listRowSeparator(.hidden)
        }
    }

    @ViewBuilder private var about: some View {
        if let biography {
            VStack(alignment: .leading, spacing: 8) {
                heading("About")
                Button {
                    withAnimation { wholeBiography.toggle() }
                } label: {
                    Text(biography).foregroundStyle(.secondary).lineLimit(wholeBiography ? nil : 4).multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
                .accessibilityHint(wholeBiography ? "Shows less" : "Shows all of it")
            }
            .padding(.vertical, 12)
            .listRowSeparator(.hidden)
        }
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
