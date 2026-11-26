import SwiftUI

@main
struct LodesongApp: App {
    @StateObject private var model = AppModel()
    @StateObject private var player = PlayerModel()
    @StateObject private var lyrics = LyricsModel()
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(Pref.appearance) private var appearance = "system"
    @AppStorage(Pref.tint) private var tint = "red"
    @AppStorage(Pref.tintCustom) private var tintCustom = ""

    init() { Notices.start() }

    var body: some Scene {
        WindowGroup {
            Group {
                if model.needsSignIn { SignInView() } else { MainView() }
            }
            .environmentObject(model)
            .environmentObject(player)
            .environmentObject(model.downloads)
            .environmentObject(lyrics)
            .tint(Theme.tint(tint, custom: tintCustom))
            .preferredColorScheme(Theme.colorScheme(appearance))
            .task {
                player.attach(app: model, downloads: model.downloads)
                lyrics.attach(app: model)
                #if DEBUG
                await model.debugSignIn()
                player.accountChanged()
                // Picks a music folder by id, for simulator runs that can't tap.
                if let folder = ProcessInfo.processInfo.environment["LODESONG_FOLDER"] { try? await model.chooseFolder(MusicFolder(id: folder, name: "Folder \(folder)")) }
                // Starts the n-th song of the library, for simulator runs that can't tap.
                if let start = ProcessInfo.processInfo.environment["LODESONG_PLAY"].flatMap(Int.init) { player.play(model.library.songs, at: start) }
                #endif
            }
            .onChange(of: model.needsSignIn) { player.accountChanged() }
            .onChange(of: model.client?.server) { player.serverChanged() }
            .onChange(of: model.offlineMode) { player.connectionChanged() }
            .onChange(of: model.lastSync) { player.librarySynced() }
        }
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active {
                Notices.scheduleExpiryWarnings()
                Task { await model.downloads.askForNoticesIfKept() }
                Task { await model.sync() }
            }
            if phase == .background { model.downloads.scheduleRefresh() }
        }
        .backgroundTask(.appRefresh(DownloadsModel.refreshTask)) {
            await model.downloads.scheduleRefresh()
            Notices.scheduleExpiryWarnings()
            await model.backgroundRefresh()
        }
        .backgroundTask(.urlSession(DownloadSession.identifier)) {
            await model.downloads.finishBackgroundEvents()
        }
    }
}
