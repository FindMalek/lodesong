import SwiftUI

struct AccountButton: View {
    @EnvironmentObject private var model: AppModel
    @State private var showing = false

    var body: some View {
        Button("Account", systemImage: "person.crop.circle") { showing = true }
            .sheet(isPresented: $showing) { AccountView() }
    }
}

private struct AccountView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
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
                        dismiss()
                        model.signOut()
                    }
                }
            }
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
        }
        .presentationDetents([.large])
    }
}
