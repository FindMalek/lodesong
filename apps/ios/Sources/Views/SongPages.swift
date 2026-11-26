import SwiftUI

/// What the library knows about one song.
struct SongInfoView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var downloads: DownloadsModel
    @Environment(\.dismiss) private var dismiss
    let song: Song

    var body: some View {
        // A queued song may be older than the library's copy.
        let song = model.library.songs.first { $0.id == self.song.id } ?? self.song
        NavigationStack {
            List {
                VStack(spacing: 6) {
                    Artwork(id: song.coverArt, size: 600, radius: 12).frame(width: 180, height: 180).padding(.bottom, 6)
                    Text(song.title).font(.title3.bold()).multilineTextAlignment(.center)
                    if let artist = song.artist { Text(artist).foregroundStyle(.secondary) }
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
                Section {
                    MarkItems(item: song)
                }
                Section {
                    row("Album", song.album)
                    row("Track", song.track.map(String.init))
                    row("Disc", song.discNumber.map(String.init))
                    row("Year", (song.year ?? model.album(id: song.albumId)?.year).map(String.init))
                    row("Genre", song.genres.map { $0.map(\.name).joined(separator: ", ") }.flatMap { $0.isEmpty ? nil : $0 } ?? song.genre)
                    row("Duration", song.duration.map { timeText(TimeInterval($0)) })
                    row("Plays", song.playCount.map(String.init))
                }
                Section("File") {
                    row("Format", song.suffix?.uppercased())
                    row("Bit Rate", song.bitRate.map { "\($0) kbps" })
                    row("Sample Rate", song.samplingRate.map { "\((Double($0) / 1000).formatted()) kHz" })
                    row("Bit Depth", song.bitDepth.flatMap { $0 > 0 ? "\($0) bit" : nil })
                    row("On This iPhone", downloads.localURL(song: song.id) == nil ? "No" : "Downloaded")
                }
            }
            .navigationTitle("Song Info")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
        }
    }

    @ViewBuilder private func row(_ label: String, _ value: String?) -> some View {
        if let value { LabeledContent(label, value: value) }
    }
}

/// Several songs at once: add them to a playlist or the queue.
struct SelectSongsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @Environment(\.dismiss) private var dismiss
    let songs: [Song]
    /// By position: a playlist may hold the same song twice.
    @State private var selection = Set<Int>()

    private var picked: [Song] { selection.sorted().map { songs[$0] } }

    var body: some View {
        NavigationStack {
            List(songs.indices, id: \.self, selection: $selection) { index in
                HStack(spacing: 12) {
                    Artwork(id: songs[index].coverArt, size: 120, radius: 6).frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(songs[index].title).lineLimit(1)
                        Text(songs[index].artist ?? " ").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
            .listStyle(.plain)
            .environment(\.editMode, .constant(.active))
            .navigationTitle(selection.isEmpty ? "Select Songs" : "\(selection.count) Selected")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done", systemImage: "xmark") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button(selection.count == songs.count ? "Deselect All" : "Select All") {
                        selection = selection.count == songs.count ? [] : Set(songs.indices)
                    }
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button("Add to Playlist", systemImage: "text.badge.plus") {
                        let songs = picked
                        SheetPresenter.show(model, player) { AddToPlaylistView(songs: songs) }
                    }
                    .labelStyle(.titleAndIcon)
                    .disabled(selection.isEmpty || !model.canEdit)
                    Spacer()
                    Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext(picked) }
                        .disabled(selection.isEmpty)
                    Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast(picked) }
                        .disabled(selection.isEmpty)
                }
            }
        }
    }
}
