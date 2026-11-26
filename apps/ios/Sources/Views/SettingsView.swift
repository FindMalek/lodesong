import SwiftUI

/// The Settings tab: for now the account and downloads screens.
struct SettingsView: View {
    var body: some View {
        AccountList()
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
            AccountList()
                .navigationTitle("Account")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
        }
        .presentationDetents([.large])
    }
}

private struct AccountList: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented

    var body: some View {
        List {
            Section {
                LabeledContent("Signed in as", value: model.user)
                LabeledContent("Server", value: model.client?.server.host() ?? "")
            }
            Section("Library") {
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
                if let error = model.syncError { Text(error).font(.footnote).foregroundStyle(.secondary) }
            }
            Section {
                NavigationLink { DownloadsView() } label: { Label("Download Settings", systemImage: "arrow.down.circle") }
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
