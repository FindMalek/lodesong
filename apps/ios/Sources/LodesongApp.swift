import SwiftUI

@main
struct LodesongApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var player = PlayerModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if model.needsSignIn { SignInView() } else { MainView() }
            }
            .environmentObject(model)
            .environmentObject(player)
            .environmentObject(model.downloads)
            #if DEBUG
            .task { await model.debugSignIn() }
            #endif
        }
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active { Task { await model.sync() } }
            if phase == .background { model.downloads.scheduleRefresh() }
        }
        .backgroundTask(.appRefresh(DownloadsModel.refreshTask)) {
            await model.downloads.scheduleRefresh()
            await model.sync()
        }
        .backgroundTask(.urlSession(DownloadSession.identifier)) {
            await model.downloads.finishBackgroundEvents()
        }
    }
}
