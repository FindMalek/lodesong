import SwiftUI

struct AlbumTile: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var downloads: DownloadsModel
    @EnvironmentObject private var router: Router
    @Environment(\.zoom) private var zoom
    let album: Album
    /// Tells apart the same album shown in two places, so the zoom starts from the one tapped.
    var section = "grid"

    private var source: String { "\(section)-\(album.id)" }
    private var songs: [Song] { model.library.songs(album: album.id) }

    var body: some View {
        // A button rather than a link: inside a list a link would draw a chevron beside every tile.
        Button {
            router.open(.album(album, source: source))
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Artwork(id: album.coverArt, size: 400, radius: 10).zoomSource(source, in: zoom).padding(.bottom, 4)
                Text(album.name).font(.subheadline).lineLimit(1)
                Text(album.artist ?? " ").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Play", systemImage: "play") { player.start(songs) }
            Button("Shuffle", systemImage: "shuffle") { player.startShuffled(songs) }
            Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext(songs) }
            Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast(songs) }
            Divider()
            if downloads.state(album: album.id) == .none {
                Button("Download", systemImage: "arrow.down.circle") { downloads.keep(album: album.id) }
            } else {
                Button("Remove Download", systemImage: "trash", role: .destructive) { downloads.remove(album: album.id) }
            }
            if let artist = model.artist(id: album.artistId) {
                Button("Go to Artist", systemImage: "music.mic") { router.open(.artist(artist)) }
            }
        } preview: {
            PreviewCard(model: model, cover: album.coverArt, title: album.name, subtitle: album.artist)
        }
    }
}

struct PlaylistTile: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var downloads: DownloadsModel
    @Environment(\.zoom) private var zoom
    let playlist: Playlist
    var section = "grid"
    var title: String?

    private var source: String { "\(section)-\(playlist.id)" }

    var body: some View {
        NavigationLink(value: Route.playlist(playlist, source: source)) {
            VStack(alignment: .leading, spacing: 2) {
                PlaylistCover(playlist: playlist)
                    .zoomSource(source, in: zoom)
                    .padding(.bottom, 4)
                Text(title ?? playlist.name).font(.subheadline).lineLimit(1)
                Text(playlist.songCount.map { "\($0) songs" } ?? " ").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            PlaylistMenu(playlist: playlist)
        } preview: {
            PreviewCard(model: model, playlist: playlist, title: playlist.name, subtitle: playlist.songCount.map { "\($0) songs" })
        }
    }
}

struct PlaylistMenu: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var downloads: DownloadsModel
    let playlist: Playlist

    var body: some View {
        Button("Play", systemImage: "play") { player.start(model.entries(playlist: playlist.id)) }
        Button("Shuffle", systemImage: "shuffle") { player.startShuffled(model.entries(playlist: playlist.id)) }
        Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext(model.entries(playlist: playlist.id)) }
        Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast(model.entries(playlist: playlist.id)) }
        Divider()
        if downloads.state(playlist: playlist.id) == .none {
            Button("Download", systemImage: "arrow.down.circle") { downloads.keep(playlist: playlist.id) }
        } else {
            Button("Remove Download", systemImage: "trash", role: .destructive) { downloads.remove(playlist: playlist.id) }
        }
    }
}

struct ArtistCircle: View {
    let artist: Artist

    var body: some View {
        NavigationLink(value: Route.artist(artist)) {
            VStack(spacing: 6) {
                Artwork(id: artist.coverArt, symbol: "music.mic", size: 300, circle: true)
                Text(artist.name).font(.subheadline).lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}

let gridColumns = [GridItem(.adaptive(minimum: 150, maximum: 240), spacing: 16, alignment: .top)]

/// A titled row of tiles that scrolls sideways.
struct Shelf<Content: View>: View {
    let title: String
    var more: Route?
    var width: CGFloat = 164
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let more {
                NavigationLink(value: more) {
                    HStack(spacing: 4) {
                        Text(title).font(.title2.bold())
                        Image(systemName: "chevron.right").font(.headline).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
            } else {
                Text(title).font(.title2.bold()).padding(.horizontal, 20)
            }
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 14) {
                    content.containerRelativeFrame(.horizontal) { length, _ in min(width, length * 0.8) }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, 20, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
        }
    }
}
