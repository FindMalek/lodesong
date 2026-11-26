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
                Toggle("Download All Playlists", isOn: $downloads.allPlaylists)
            } footer: {
                Text("New playlists too. A playlist you remove stays removed. To download one only, use its download button.")
            }

            Section {
                NavigationLink { DownloadQueueView() } label: { LabeledContent("Queue", value: downloads.pending.count.formatted()) }
                NavigationLink { DownloadedSongsView() } label: { LabeledContent("Downloaded Songs", value: downloads.songs.count.formatted()) }
            }

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

/// What still has to come down, in the order it will.
struct DownloadQueueView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var downloads: DownloadsModel

    var body: some View {
        let pending = downloads.pending
        List {
            if !pending.isEmpty && model.offlineMode {
                Text("Paused while Offline Mode is on.").foregroundStyle(.secondary)
            }
            ForEach(pending) { song in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(song.title).lineLimit(1)
                        Text(song.artist ?? " ").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Text(downloads.failed.contains(song.id) ? "Failed" : "Waiting")
                        .font(.subheadline)
                        .foregroundStyle(downloads.failed.contains(song.id) ? .red : .secondary)
                }
            }
        }
        .overlay {
            if pending.isEmpty { ContentUnavailableView("Nothing Waiting", systemImage: "checkmark.circle") }
        }
        .navigationTitle("Download Queue")
        .toolbar {
            if downloads.failures > 0 { Button("Retry", systemImage: "arrow.clockwise") { downloads.retry() } }
        }
    }
}

struct DownloadedSongsView: View {
    @EnvironmentObject private var downloads: DownloadsModel

    var body: some View {
        let songs = downloads.songs
        List {
            if !songs.isEmpty { PlayShuffleButtons(songs: songs).listRowSeparator(.hidden) }
            ForEach(Array(songs.enumerated()), id: \.element.id) { index, _ in
                SongRow(songs: songs, index: index)
            }
        }
        .listStyle(.plain)
        .overlay {
            if songs.isEmpty { ContentUnavailableView("No Downloaded Songs", systemImage: "arrow.down.circle") }
        }
        .navigationTitle("Downloaded Songs")
    }
}
