import SwiftUI

enum Route: Hashable {
    case album(Album, source: String? = nil)
    case artist(Artist)
    case playlist(Playlist, source: String? = nil)
    case playlists, artists, albums, songs, downloaded
    case decade(Int)
}

enum AppTab: Hashable {
    case home, library, search
}

@MainActor
final class Router: ObservableObject {
    @Published var tab = AppTab.home
    @Published var home: [Route] = []
    @Published var library: [Route] = []
    @Published var search: [Route] = []
    @Published var showingPlayer = false

    func open(_ route: Route) {
        showingPlayer = false
        switch tab {
        case .home: home.append(route)
        case .library: library.append(route)
        case .search: search.append(route)
        }
    }
}

private struct ZoomKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}

extension EnvironmentValues {
    var zoom: Namespace.ID? {
        get { self[ZoomKey.self] }
        set { self[ZoomKey.self] = newValue }
    }
}

extension View {
    /// Marks a tile as the place its page zooms out of.
    @ViewBuilder func zoomSource(_ id: String, in namespace: Namespace.ID?) -> some View {
        if let namespace { matchedTransitionSource(id: id, in: namespace) } else { self }
    }

    @ViewBuilder func zoomDestination(_ id: String?, in namespace: Namespace.ID?) -> some View {
        if let id, let namespace { navigationTransition(.zoom(sourceID: id, in: namespace)) } else { self }
    }
}

/// One stack per tab, all sharing the same destinations.
struct TabStack<Root: View>: View {
    @Binding var path: [Route]
    @ViewBuilder let root: Root
    @Namespace private var zoom

    var body: some View {
        stack.safeAreaInset(edge: .bottom) { OfferBanner() }
            .environment(\.zoom, zoom)
    }

    private var stack: some View {
        NavigationStack(path: $path) {
            root.navigationDestination(for: Route.self) { route in
                switch route {
                case .album(let album, let source): AlbumView(album: album).zoomDestination(source, in: zoom)
                case .artist(let artist): ArtistView(artist: artist)
                case .playlist(let playlist, let source): PlaylistView(playlist: playlist).zoomDestination(source, in: zoom)
                case .playlists: PlaylistsView()
                case .artists: ArtistsView()
                case .albums: AlbumsView()
                case .songs: SongsView()
                case .downloaded: DownloadedView()
                case .decade(let decade): AlbumsView(decade: decade)
                }
            }
        }
    }
}
