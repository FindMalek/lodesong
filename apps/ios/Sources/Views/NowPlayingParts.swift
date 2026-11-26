import SwiftUI

struct CircleIcon: View {
    let symbol: String

    var body: some View {
        Image(systemName: symbol)
            .font(.headline)
            .contentTransition(.symbolEffect(.replace))
            .frame(width: 34, height: 34)
            .background(.white.opacity(0.18), in: .circle)
    }
}

struct LikeButton: View {
    @EnvironmentObject private var player: PlayerModel
    let song: Song

    var body: some View {
        let liked = player.isLiked(song)
        Button {
            Haptic.tap()
            player.setLiked(song, !liked)
        } label: {
            CircleIcon(symbol: liked ? "heart.fill" : "heart")
        }
        .accessibilityLabel("Like")
        .accessibilityValue(liked ? "Liked" : "Not liked")
    }
}

/// Tapping the current number of stars takes the rating away, as the web player does.
struct RatingStars: View {
    @EnvironmentObject private var player: PlayerModel
    let song: Song

    var body: some View {
        let rating = player.rating(song)
        HStack(spacing: 0) {
            ForEach(1...5, id: \.self) { star in
                Button {
                    Haptic.tap()
                    player.rate(song, star == rating ? 0 : star)
                } label: {
                    Image(systemName: star <= rating ? "star.fill" : "star")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(star <= rating ? 0.95 : 0.4))
                        .frame(width: 30, height: 30)
                        .contentShape(.rect)
                }
            }
        }
        // The first star lines up with the title above it.
        .padding(.leading, -7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement()
        .accessibilityLabel("Rating")
        .accessibilityValue(rating == 0 ? "Not rated" : "\(rating) of 5 stars")
        .accessibilityAdjustableAction { direction in
            player.rate(song, min(5, max(0, rating + (direction == .increment ? 1 : -1))))
        }
    }
}

/// One small line about the song that is on: where it plays from and in what format,
/// or that a like or rating is still waiting for the server.
struct StreamInfo: View {
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var downloads: DownloadsModel
    let song: Song
    let detailed: Bool

    var body: some View {
        HStack(spacing: 4) {
            if player.sleepTimer != nil {
                Image(systemName: "moon.zzz.fill").accessibilityLabel("Sleep timer on")
            }
            if downloads.localURL(song: song.id) != nil {
                Image(systemName: "arrow.down.circle.fill").accessibilityLabel("Downloaded")
            }
            if player.isUnsent(song) {
                Image(systemName: "icloud.slash")
                Text("Saved, sends later")
            } else if detailed, let detail {
                Text(detail).monospacedDigit()
            }
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.white.opacity(0.6))
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .accessibilityElement(children: .combine)
    }

    private var detail: String? {
        #if DEBUG
        if DebugScreen.sample, player.queue.isEmpty { return StreamLine.text(song, source: .original, limit: 320) }
        #endif
        return player.streamDetail.flatMap { $0.isEmpty ? nil : $0 }
    }
}

/// Puts a whole playlist at the end of the queue.
struct AddPlaylistButton: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel

    var body: some View {
        Menu {
            Section("Add to Queue") {
                ForEach(model.library.playlists) { playlist in
                    Button(playlist.name) { add(playlist) }
                }
            }
        } label: {
            Image(systemName: "text.badge.plus")
                .font(.title3)
                .foregroundStyle(.white.opacity(0.7))
                .frame(width: 44, height: 44)
                .contentShape(.rect)
        }
        .disabled(model.library.playlists.isEmpty)
        .accessibilityLabel("Add from playlist")
    }

    private func add(_ playlist: Playlist) {
        var songs = model.entries(playlist: playlist.id)
        if model.offlineMode { songs = songs.filter { player.localFile($0.id) != nil } }
        guard !songs.isEmpty else {
            return Popup.show("Nothing to Add", message: model.offlineMode ? "None of it is on this iPhone." : "This playlist is empty.")
        }
        player.queueLast(songs)
    }
}

/// Behind the "..." on now playing: the song's pages, the sleep timer and the settings that act on what you see and hear.
struct QuickSettings: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var router: Router
    @Environment(\.dismiss) private var dismiss
    @AppStorage(Pref.speed) private var speed = 1.0
    @AppStorage(Pref.replayGain) private var replayGain = "auto"
    @AppStorage(Pref.keepAwake) private var keepAwake = false
    @AppStorage(Pref.movingBackground) private var movingBackground = true
    let song: Song

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AddToPlaylistItem { [song] }
                    MarkItems(item: song)
                    ShareItem(kind: "song", id: song.id)
                    Button("Song Info", systemImage: "info.circle") { SheetPresenter.show(model, player) { SongInfoView(song: song) } }
                }
                if let album = model.album(id: song.albumId) {
                    Section {
                        Button("Go to Album", systemImage: "square.stack") { router.open(.album(album)) }
                        if let artist = model.artist(id: album.artistId) {
                            Button("Go to Artist", systemImage: "music.mic") { router.open(.artist(artist)) }
                        }
                    }
                }
                Section {
                    Picker("Sleep Timer", systemImage: "moon.zzz", selection: sleep) {
                        Text("Off").tag(0)
                        if case .at(let time) = player.sleepTimer {
                            Text("Until \(time.formatted(date: .omitted, time: .shortened))").tag(-2)
                        }
                        ForEach([5, 15, 30, 45, 60], id: \.self) { Text("\($0) Minutes").tag($0) }
                        Text("End of Song").tag(-1)
                    }
                    Picker("Speed", systemImage: "gauge.with.needle", selection: $speed) {
                        ForEach([0.75, 1, 1.25, 1.5, 2], id: \.self) { Text("\($0.formatted())×").tag($0) }
                    }
                    Picker("ReplayGain", systemImage: "speaker.wave.2", selection: $replayGain) {
                        Text("Automatic").tag("auto")
                        Text("Per Song").tag("track")
                        Text("Per Album").tag("album")
                        Text("Off").tag("off")
                    }
                }
                Section("Now Playing") {
                    NowPlayingToggles()
                    Toggle("Moving Player Background", isOn: $movingBackground)
                    Toggle("Keep Screen Awake", isOn: $keepAwake)
                }
                Section {
                    NavigationLink { PlaybackSettings() } label: { Label("All Playback Settings", systemImage: "play.circle") }
                    NavigationLink { AppearanceSettings() } label: { Label("Appearance", systemImage: "paintpalette") }
                }
            }
            .navigationTitle(song.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
        }
        .presentationDetents([.medium, .large])
    }

    /// Minutes to pick, zero for off, -1 for the end of the song, -2 for the one already counting down.
    private var sleep: Binding<Int> {
        Binding {
            switch player.sleepTimer {
            case .at: return -2
            case .endOfSong: return -1
            case nil: return 0
            }
        } set: { choice in
            switch choice {
            case 0: player.setSleepTimer(nil)
            case -1: player.setSleepTimer(.endOfSong)
            case 1...: player.setSleepTimer(.at(Date().addingTimeInterval(Double(choice) * 60)))
            default: break
            }
        }
    }
}
