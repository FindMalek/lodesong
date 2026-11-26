import SwiftUI

/// The Settings tab. Everything has a default that works, so nobody has to come here.
struct SettingsView: View {
    var body: some View {
        SettingsList()
            .navigationTitle("Settings")
            .toolbarTitleDisplayMode(.inlineLarge)
    }
}

struct AccountButton: View {
    @State private var showing = false

    var body: some View {
        Button("Account", systemImage: "person.crop.circle") { showing = true }
            .sheet(isPresented: $showing) { AccountSheet() }
    }
}

private struct AccountSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            SettingsList()
                .navigationTitle("Account")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
        }
        .presentationDetents([.large])
    }
}

private struct SettingsList: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented

    var body: some View {
        List {
            Section {
                LabeledContent("Signed in as", value: model.user)
                LabeledContent("Server", value: model.client?.server.host() ?? "")
                LabeledContent("Status") {
                    Text(model.syncing ? "Syncing…" : model.syncError == nil ? "Connected" : "Can't reach the server")
                }
                if let last = model.lastSync {
                    LabeledContent("Last Synced", value: last.formatted(.relative(presentation: .named)))
                }
                LabeledContent("Songs", value: model.library.songs.count.formatted())
                Button {
                    Task { await model.sync() }
                } label: {
                    HStack {
                        Label("Sync Now", systemImage: "arrow.clockwise")
                        Spacer()
                        if model.syncing { ProgressView() }
                    }
                }
                .disabled(model.syncing)
            } footer: {
                if let error = model.syncError { Text(error) }
            }
            Section {
                NavigationLink { PlaybackSettings() } label: { Label("Playback", systemImage: "play.circle") }
                NavigationLink { AppearanceSettings() } label: { Label("Appearance", systemImage: "paintpalette") }
                NavigationLink { StorageSettings() } label: { Label("Storage", systemImage: "internaldrive") }
                NavigationLink { AboutSettings() } label: { Label("About", systemImage: "info.circle") }
            }
            Section {
                Button("Sign Out", role: .destructive) {
                    // Closes the sheet; the tab is replaced by the sign in screen on its own.
                    if isPresented { dismiss() }
                    model.signOut()
                }
            }
        }
    }
}
