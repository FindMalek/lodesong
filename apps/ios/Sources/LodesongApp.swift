import SwiftUI

@main
struct LodesongApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var player = PlayerModel()
    @StateObject private var lyrics = LyricsModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if model.needsSignIn { SignInView() } else { MainView() }
            }
            .environmentObject(model)
            .environmentObject(player)
            .environmentObject(model.downloads)
            .environmentObject(lyrics)
            .task {
                player.attach(app: model, downloads: model.downloads)
                lyrics.attach(app: model)
                #if DEBUG
                await model.debugSignIn()
                player.accountChanged()
                // Starts the n-th song of the library, for simulator runs that can't tap.
                if let start = ProcessInfo.processInfo.environment["LODESONG_PLAY"].flatMap(Int.init) { player.play(model.library.songs, at: start) }
                #endif
            }
            .onChange(of: model.needsSignIn) { player.accountChanged() }
        }
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active { Task { await model.sync() } }
            if phase == .background { model.downloads.scheduleRefresh() }
        }
        .backgroundTask(.appRefresh(DownloadsModel.refreshTask)) {
            await model.downloads.scheduleRefresh()
            await model.backgroundRefresh()
        }
        .backgroundTask(.urlSession(DownloadSession.identifier)) {
            await model.downloads.finishBackgroundEvents()
        }
    }
}
