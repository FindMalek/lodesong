import SwiftUI

struct MainView: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var router = Router()
    @StateObject private var additions = AdditionsModel()
    @Environment(\.scenePhase) private var scenePhase
    @Namespace private var playerZoom
    @AppStorage(Pref.minimizeTabBar) private var minimizeTabBar = true
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
        .tabBarMinimizeBehavior(minimizeTabBar ? .onScrollDown : .never)
        .tabViewBottomAccessory {
            MiniPlayer().matchedTransitionSource(id: "player", in: playerZoom)
        }
        .fullScreenCover(isPresented: $router.showingPlayer) {
            NowPlayingView()
                .navigationTransition(.zoom(sourceID: "player", in: playerZoom))
                .environmentObject(router)
        }
        .environmentObject(router)
        .environmentObject(additions)
        .onAppear {
            AccountData.adopt("\(model.client?.identity.absoluteString ?? "") \(model.user)")
            additions.load()
        }
        .task(id: [additions.unsettled ? 1 : 0, additions.round]) { await additions.follow(model) }
        .onChange(of: scenePhase) { _, phase in if phase == .active { additions.restart() } }
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
