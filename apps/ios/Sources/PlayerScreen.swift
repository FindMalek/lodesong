import SwiftUI
import UIKit
import WebKit

struct WebViewHost: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct PlayerScreen: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var player: PlayerController

    init(server: URL) {
        _player = StateObject(wrappedValue: PlayerController(server: server))
    }

    var body: some View {
        ZStack {
            player.background.ignoresSafeArea()
            WebViewHost(webView: player.webView)
            if case .failed(let message) = player.phase {
                FailedView(message: message, retry: { player.reload() }, change: { model.server = nil })
            }
        }
        .confirmationDialog("lodesong", isPresented: $player.showMenu, titleVisibility: .visible) {
            Button("reload") { player.reload() }
            Button("change server", role: .destructive) { model.server = nil }
            Button("cancel", role: .cancel) {}
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            player.syncBackground()
        }
    }
}

/// The server didn't answer: say so, and offer the two things that can help.
struct FailedView: View {
    let message: String
    let retry: () -> Void
    let change: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("can't reach your lodesong").font(.title2.weight(.medium))
            Text(message).foregroundStyle(.secondary)
            HStack {
                Button("try again", action: retry).buttonStyle(.borderedProminent).tint(.primary)
                Button("change server", action: change).buttonStyle(.bordered).tint(.primary)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color(UIColor.systemBackground))
    }
}
