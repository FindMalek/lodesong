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

            Section {
                Picker("Downloads at Once", selection: $downloads.atOnce) {
                    Text("Automatic").tag(0)
                    ForEach([1, 2, 3, 5], id: \.self) { Text("\($0)").tag($0) }
                }
            } footer: {
                Text("With a limit, downloads are slower while the app is closed: iOS only wakes it now and then to start the next ones.")
            }

            Section {
                Toggle("Check When the App Opens", isOn: $downloads.autoOnOpen)
                Toggle("Check Every 10 Minutes", isOn: $downloads.autoPeriodic)
            } header: {
                Text("Auto Download")
            } footer: {
                Text("Kept playlists and albums take new songs and drop removed ones. The 10 minute check runs while Lodesong is running, and with Download on Wi-Fi Only on it skips cellular and other metered networks; once iOS suspends or closes it, iOS decides when it wakes, if at all. Sync Now always updates them, and a playlist's menu can override this.")
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

/// One kept playlist's own choice over the Auto Download settings.
struct AutoDownloadPicker: View {
    @EnvironmentObject private var downloads: DownloadsModel
    let playlist: String

    var body: some View {
        if downloads.state(playlist: playlist) != .none {
            Picker(selection: Binding(get: { downloads.follows(playlist: playlist) }, set: { downloads.setFollows($0, playlist: playlist) })) {
                Text("Use Settings").tag(Bool?.none)
                Text("Always").tag(Bool?.some(true))
                Text("Never").tag(Bool?.some(false))
            } label: {
                Label("Auto Download", systemImage: "arrow.triangle.2.circlepath")
            }
            .pickerStyle(.menu)
        }
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
