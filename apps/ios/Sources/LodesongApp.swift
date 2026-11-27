import CoreSpotlight
import SwiftUI

/// The one set of models, shared by the window and by shortcuts, which can run without one.
@MainActor
enum AppServices {
    static let model = AppModel()
    static let player = PlayerModel()
    static let lyrics = LyricsModel()

    /// Safe to call again.
    static func start() {
        player.attach(app: model, downloads: model.downloads)
        lyrics.attach(app: model)
    }
}

@main
struct LodesongApp: App {
    @StateObject private var model = AppServices.model
    @StateObject private var player = AppServices.player
    @StateObject private var lyrics = AppServices.lyrics
    @StateObject private var links = Links()
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
            .environmentObject(links)
            // Signed out, a link is dropped: it must not carry over into whoever signs in next.
            .onOpenURL { if !model.needsSignIn { links.pending = AppLink($0) } }
            .onContinueUserActivity(CSSearchableItemActionType) { activity in
                guard !model.needsSignIn, let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String else { return }
                links.pending = AppLink(spotlightID: id)
            }
            .tint(Theme.tint(tint, custom: tintCustom))
            .preferredColorScheme(Theme.colorScheme(appearance))
            .task {
                AppServices.start()
                #if DEBUG
                await model.debugSignIn()
                player.accountChanged()
                // Picks a music folder by id, for simulator runs that can't tap.
                if let folder = ProcessInfo.processInfo.environment["LODESONG_FOLDER"] { try? await model.chooseFolder(MusicFolder(id: folder, name: "Folder \(folder)")) }
                // Starts the n-th song of the library, for simulator runs that can't tap.
                if let start = ProcessInfo.processInfo.environment["LODESONG_PLAY"].flatMap(Int.init) { player.play(model.library.songs, at: start) }
                #endif
            }
            .onChange(of: model.needsSignIn) {
                links.pending = nil
                player.accountChanged()
            }
            .onChange(of: model.client?.server) { player.serverChanged() }
            .onChange(of: model.offlineMode) { player.connectionChanged() }
            .onChange(of: model.lastSync) { player.librarySynced() }
        }
        .onChange(of: scenePhase, initial: true) { _, phase in
            if phase == .active {
                Notices.scheduleExpiryWarnings()
                Task { await model.downloads.askForNoticesIfKept() }
                Task { await model.sync(.open) }
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
