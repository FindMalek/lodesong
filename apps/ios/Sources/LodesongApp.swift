import SwiftUI

@main
struct LodesongApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let server = model.server {
            PlayerScreen(server: server).id(server)
        } else {
            SetupView()
        }
    }
}
