import SwiftUI

/// Download settings and the space each kept playlist or album takes. Link to it from anywhere in a `NavigationStack`.
struct DownloadsView: View {
    @EnvironmentObject private var downloads: DownloadsModel

    var body: some View {
        List {
            Section {
                Toggle("Download on Wi-Fi Only", isOn: $downloads.wifiOnly)
                Picker("Quality", selection: $downloads.quality) {
                    Text("Original").tag(DownloadQuality.original)
                    Text("MP3 320 kbps").tag(DownloadQuality.high)
                    Text("MP3 192 kbps").tag(DownloadQuality.medium)
                    Text("MP3 128 kbps").tag(DownloadQuality.low)
                }
            } footer: {
                Text("Quality applies to new downloads. Formats iPhone can't play are saved as MP3.")
            }

            NewTracksToggle()

            Section {
                ForEach(downloads.collections) { kept in
                    VStack(alignment: .leading) {
                        Text(kept.name).lineLimit(1)
                        Text(detail(kept)).font(.subheadline).foregroundStyle(.secondary)
                    }
                    .swipeActions {
                        Button("Remove", systemImage: "trash", role: .destructive) { downloads.remove(kept.ref) }
                    }
                }
            } header: {
                if !downloads.collections.isEmpty { Text("On This iPhone · \(size(downloads.totalBytes))") }
            } footer: {
                if downloads.failures > 0 {
                    Text("\(downloads.failures == 1 ? "1 song" : "\(downloads.failures) songs") couldn't be downloaded. The next sync tries again.")
                }
            }
        }
        .navigationTitle("Downloads")
        .overlay {
            if downloads.collections.isEmpty {
                ContentUnavailableView("No Downloads", systemImage: "arrow.down.circle", description: Text("Downloaded playlists and albums show here."))
            }
        }
    }

    private func detail(_ kept: KeptCollection) -> String {
        var parts: [String] = []
        switch downloads.state(kept.ref) {
        case .downloading(let done, let total): parts.append("\(done) of \(total) songs")
        default: parts.append("\(kept.songs.count) songs")
        }
        parts.append(size(downloads.bytes(kept.ref)))
        if !kept.onServer { parts.append("not on the server") }
        return parts.joined(separator: " · ")
    }

    private func size(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}
