import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @AppStorage(Recents.key) private var recents = ""

    private var recent: [Album] { Recents.ids(recents).compactMap { model.album(id: $0) } }
    private var latest: [Album] { Array(model.library.albums.sorted { ($0.year ?? 0) > ($1.year ?? 0) }.prefix(20)) }

    /// A different handful every day, the same one all day.
    private var rediscover: [Album] {
        let albums = model.library.albums
        guard !albums.isEmpty else { return [] }
        let day = Calendar.current.ordinality(of: .day, in: .era, for: .now) ?? 0
        let picks = (0..<min(12, albums.count)).map { (day * 31 + $0 * 97) % albums.count }
        var seen = Set<Int>()
        return picks.filter { seen.insert($0).inserted }.map { albums[$0] }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                OfflineNotice().padding(.horizontal, 20)
                if !rediscover.isEmpty {
                    Shelf(title: "Picked for Today", width: 250) {
                        ForEach(rediscover) { FeatureCard(album: $0) }
                    }
                }
                if !recent.isEmpty {
                    Shelf(title: "Recently Played") {
                        ForEach(recent) { AlbumTile(album: $0, section: "recent") }
                    }
                }
                if !model.library.playlists.isEmpty {
                    Shelf(title: "Playlists", more: .playlists) {
                        ForEach(model.library.playlists.prefix(20)) { PlaylistTile(playlist: $0, section: "home") }
                    }
                }
                if !latest.isEmpty {
                    Shelf(title: "Latest Releases", more: .albums) {
                        ForEach(latest) { AlbumTile(album: $0, section: "latest") }
                    }
                }
                if !model.library.artists.isEmpty {
                    Shelf(title: "Artists", more: .artists, width: 112) {
                        ForEach(model.library.artists.prefix(20)) { ArtistCircle(artist: $0) }
                    }
                }
            }
            .padding(.vertical, 8)
            // Full width even when empty, or the loading and empty states get squeezed.
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable { await model.sync() }
        .libraryState(model.library.songs.isEmpty, "No Music Yet", "music.note.house")
        .navigationTitle("Home")
        .toolbar { AccountButton() }
    }
}

private struct FeatureCard: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.zoom) private var zoom
    let album: Album

    var body: some View {
        NavigationLink(value: Route.album(album, source: "today-\(album.id)")) {
            VStack(spacing: 0) {
                Artwork(id: album.coverArt, size: 600, radius: 0)
                VStack(spacing: 2) {
                    Text(album.name).font(.headline).lineLimit(1)
                    Text(album.artist ?? " ").font(.subheadline).opacity(0.75).lineLimit(1)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity)
                .background { ArtworkBackground(id: album.coverArt, moving: false) }
                .clipped()
            }
            .clipShape(.rect(cornerRadius: 16))
            .zoomSource("today-\(album.id)", in: zoom)
        }
        .buttonStyle(.plain)
    }
}

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
