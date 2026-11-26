import SwiftUI

@main
struct LodesongApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var player = PlayerModel()
    @StateObject private var downloads = DownloadsModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if model.needsSignIn { SignInView() } else { MainView() }
            }
            .environmentObject(model)
            .environmentObject(player)
            .environmentObject(downloads)
            .task {
                player.attach(app: model, downloads: downloads)
                #if DEBUG
                await model.debugSignIn()
                player.accountChanged()
                // Starts the n-th song of the library, for simulator runs that can't tap.
                if let start = ProcessInfo.processInfo.environment["LODESONG_PLAY"].flatMap(Int.init) { player.play(model.library.songs, at: start) }
                #endif
            }
            .onChange(of: model.needsSignIn) { player.accountChanged() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.sync() } }
        }
    }
}
