import SwiftUI

struct MainView: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var router = Router()
    @Namespace private var playerZoom
    #if DEBUG
    @State private var openedDebugScreen = false
    #endif

    var body: some View {
        TabView(selection: $router.tab) {
            Tab("Home", systemImage: "house.fill", value: AppTab.home) {
                TabStack(path: $router.home) { HomeView() }
            }
            Tab("Library", systemImage: "music.note.square.stack.fill", value: AppTab.library) {
                TabStack(path: $router.library) { LibraryView() }
            }
            Tab("Playlists", systemImage: "music.note.list", value: AppTab.playlists) {
                TabStack(path: $router.playlists) { PlaylistsTab() }
            }
            Tab("Settings", systemImage: "gearshape.fill", value: AppTab.settings) {
                TabStack(path: $router.settings) { SettingsView() }
            }
            Tab("Search", systemImage: "magnifyingglass", value: AppTab.search, role: searchRole) {
                TabStack(path: $router.search) { SearchView() }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .tabViewBottomAccessory {
            MiniPlayer().matchedTransitionSource(id: "player", in: playerZoom)
        }
        .fullScreenCover(isPresented: $router.showingPlayer) {
            NowPlayingView()
                .navigationTransition(.zoom(sourceID: "player", in: playerZoom))
                .environmentObject(router)
        }
        .environmentObject(router)
        .tint(.accent)
        .onAppear { AccountData.adopt("\(model.client?.server.absoluteString ?? "") \(model.user)") }
        #if DEBUG
        .task(id: model.library.songs.count) {
            guard !openedDebugScreen, !model.library.songs.isEmpty else { return }
            openedDebugScreen = true
            DebugScreen.open(model.library, router: router)
        }
        #endif
    }

    /// iOS 27 folds a plain search tab in with the others; the prominent role keeps it apart, as Home and Library expect.
    private var searchRole: TabRole {
        // Xcode 26 has no such role to compile against.
        #if compiler(>=6.4)
        if #available(iOS 27, *) { return .prominent }
        #endif
        return .search
    }
}
