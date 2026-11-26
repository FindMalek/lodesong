import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @ObservedObject private var home = HomeFeedModel.shared
    @AppStorage("homeSections") private var stored = ""
    @State private var editing = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                OfflineNotice().padding(.horizontal, 20)
                ForEach(HomeLayout(stored).shown, id: \.self) { section in
                    HomeSectionView(section: section, feed: home.feed)
                }
            }
            .padding(.vertical, 8)
            // Full width even when empty, or the loading and empty states get squeezed.
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable {
            await model.sync()
            await refresh(reshuffle: true)
        }
        // Reads the last copy from disk before anything is asked of the server.
        .onAppear { if let server = model.client?.server { home.use(server: server, user: model.user) } }
        // Runs again each time Home comes back, so what was just played shows up.
        .task(id: model.syncing) { if !model.syncing { await refresh() } }
        .libraryState(model.library.songs.isEmpty, "No Music Yet", "music.note.house")
        .navigationTitle("Home")
        .toolbarTitleDisplayMode(.inlineLarge)
        .toolbar {
            Button("Edit Home", systemImage: "slider.horizontal.3") { editing = true }
            AccountButton()
        }
        .sheet(isPresented: $editing) { HomeEditor(stored: $stored) }
        #if DEBUG
        .onAppear { if DebugScreen.name == "homeedit" { editing = true } }
        #endif
    }

    private func refresh(reshuffle: Bool = false) async {
        guard let client = model.client else { return }
        home.use(server: client.server, user: model.user)
        await home.refresh(client, reshuffle: reshuffle)
    }
}

/// What a section holds right now.
private enum HomeContent {
    case songs([Song])
    case albums([Album])
    case artists([Artist])
    case playlists([Playlist])

    var isEmpty: Bool {
        switch self {
        case .songs(let items): return items.isEmpty
        case .albums(let items): return items.isEmpty
        case .artists(let items): return items.isEmpty
        case .playlists(let items): return items.isEmpty
        }
    }

    @MainActor init(_ section: HomeSection, _ feed: HomeFeed, _ model: AppModel, _ player: PlayerModel) {
        switch section {
        case .upNext:
            let playback = player.playback(model.library)
            self = .songs(Array(playback.queue.dropFirst(playback.index + 1)))
        case .recentlyPlayed: self = .albums(feed.recentlyPlayed)
        case .recentlyAdded: self = .albums(feed.recentlyAdded)
        case .frequentlyPlayed: self = .albums(feed.frequentlyPlayed)
        case .topPlayed: self = .songs(feed.topPlayed)
        case .history: self = .songs(feed.history)
        case .playlists: self = .playlists(model.library.playlists)
        case .favoriteSongs: self = .songs(feed.favoriteSongs)
        case .favoriteAlbums: self = .albums(feed.favoriteAlbums)
        case .favoriteArtists: self = .artists(feed.favoriteArtists)
        case .randomAlbums: self = .albums(feed.randomAlbums)
        case .randomSongs: self = .songs(feed.randomSongs)
        }
    }
}

extension HomeSection {
    fileprivate var emptyText: String {
        switch self {
        case .upNext: return "Songs you queue show here."
        case .recentlyPlayed, .frequentlyPlayed, .topPlayed, .history: return "Play some music and it shows here."
        case .recentlyAdded, .randomAlbums, .randomSongs: return "Nothing to show yet."
        case .playlists: return "Playlists you make show here."
        case .favoriteSongs: return "Songs you favorite show here."
        case .favoriteAlbums: return "Albums you favorite show here."
        case .favoriteArtists: return "Artists you favorite show here."
        }
    }
}

private struct HomeSectionView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    let section: HomeSection
    let feed: HomeFeed
    /// Song sections show this many; the rest are behind the title.
    private let rows = 4

    var body: some View {
        let content = HomeContent(section, feed, model, player)
        if content.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text(section.title).font(.title2.bold())
                Text(section.emptyText).font(.subheadline).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 20)
        } else {
            let source = "home-\(section.rawValue)"
            switch content {
            case .albums(let albums):
                Shelf(title: section.title, more: .homeSection(section)) {
                    ForEach(albums) { AlbumTile(album: $0, section: source) }
                }
            case .artists(let artists):
                Shelf(title: section.title, more: .homeSection(section), width: 112) {
                    ForEach(artists) { ArtistCircle(artist: $0) }
                }
            case .playlists(let playlists):
                Shelf(title: section.title, more: .playlists) {
                    ForEach(playlists.prefix(20)) { PlaylistTile(playlist: $0, section: source) }
                }
            case .songs(let songs):
                VStack(alignment: .leading, spacing: 10) {
                    NavigationLink(value: Route.homeSection(section)) {
                        HStack(spacing: 4) {
                            Text(section.title).font(.title2.bold())
                            Image(systemName: "chevron.right").font(.headline).foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    // By position: history can hold the same song twice.
                    ForEach(Array(songs.prefix(rows).indices), id: \.self) { index in
                        HomeSongRow(section: section, songs: songs, index: index)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }
}

/// A queued song jumps there and keeps the queue; any other list starts playing from the one tapped.
private struct HomeSongRow: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    let section: HomeSection
    let songs: [Song]
    let index: Int

    var body: some View {
        if section == .upNext {
            Button {
                Haptic.tap()
                player.jump(to: player.playback(model.library).index + 1 + index)
            } label: {
                HStack(spacing: 12) {
                    Artwork(id: songs[index].coverArt, size: 120, radius: 6).frame(width: 48, height: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(songs[index].title).lineLimit(1)
                        Text(songs[index].artist ?? " ").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .contextMenu { SongMenu(song: songs[index]) }
        } else {
            SongRow(songs: songs, index: index)
        }
    }
}

/// Everything in one section.
struct HomeSectionPage: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @ObservedObject private var home = HomeFeedModel.shared
    let section: HomeSection

    var body: some View {
        let content = HomeContent(section, home.feed, model, player)
        Group {
            switch content {
            case .songs(let songs):
                List {
                    ForEach(Array(songs.indices), id: \.self) { HomeSongRow(section: section, songs: songs, index: $0) }
                }
                .listStyle(.plain)
            case .albums(let albums):
                grid { ForEach(albums) { AlbumTile(album: $0) } }
            case .artists(let artists):
                grid { ForEach(artists) { ArtistCircle(artist: $0) } }
            case .playlists(let playlists):
                grid { ForEach(playlists) { PlaylistTile(playlist: $0) } }
            }
        }
        .overlay {
            if content.isEmpty { ContentUnavailableView(section.title, systemImage: "music.note", description: Text(section.emptyText)) }
        }
        .navigationTitle(section.title)
    }

    private func grid(@ViewBuilder _ tiles: () -> some View) -> some View {
        ScrollView {
            LazyVGrid(columns: gridColumns, spacing: 20) { tiles() }.padding(20)
        }
    }
}

/// Show, hide and reorder the sections.
struct HomeEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var stored: String

    var body: some View {
        NavigationStack {
            List {
                ForEach(HomeLayout(stored).items) { item in
                    Toggle(item.section.title, isOn: shown(item.section))
                }
                .onMove { source, target in
                    var layout = HomeLayout(stored)
                    layout.items.move(fromOffsets: source, toOffset: target)
                    stored = layout.raw
                }
                Button("Reset to Default") { stored = "" }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Edit Home")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
        }
    }

    private func shown(_ section: HomeSection) -> Binding<Bool> {
        Binding {
            HomeLayout(stored).shown.contains(section)
        } set: { on in
            var layout = HomeLayout(stored)
            if let index = layout.items.firstIndex(where: { $0.section == section }) { layout.items[index].shown = on }
            stored = layout.raw
        }
    }
}
