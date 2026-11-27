import SwiftUI

/// Recent syncs and failures, to read or send along with a bug report.
struct LogsView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage(Pref.redactHost) private var redact = true
    @State private var lines: [String] = []

    private var shown: [String] {
        guard redact else { return lines }
        let hosts = [model.mainServer?.host(), model.secondServer?.host(), model.client?.server.host()].compactMap { $0 }
        return lines.map { AppLog.redact($0, hosts: hosts) }
    }

    var body: some View {
        let shown = shown
        List {
            Section {
                Toggle("Hide Server Address", isOn: $redact)
            }
            Section {
                // Newest first.
                ForEach(Array(shown.enumerated().reversed()), id: \.offset) { _, line in
                    Text(line).font(.caption.monospaced()).textSelection(.enabled)
                }
            }
        }
        .overlay {
            if lines.isEmpty { ContentUnavailableView("No Logs", systemImage: "doc.text") }
        }
        .navigationTitle("Logs")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ShareLink(item: shown.joined(separator: "\n")).disabled(lines.isEmpty)
            Button("Clear", systemImage: "trash") {
                AppLog.shared.clear()
                lines = []
            }
            .disabled(lines.isEmpty)
        }
        .onAppear { lines = AppLog.shared.lines }
    }
}
