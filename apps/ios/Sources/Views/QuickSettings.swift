import SwiftUI

/// Behind the "..." on now playing: the song's actions, and the settings that act on what you see and hear.
struct QuickSettings: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var lyrics: LyricsModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage(Pref.speed) private var speed = 1.0
    @AppStorage(Pref.replayGain) private var replayGain = "auto"
    @AppStorage(Pref.infinitePlay) private var infinitePlay = false
    @AppStorage(Pref.queueSync) private var queueSync = true
    @AppStorage(Pref.wifiBitRate) private var wifiBitRate = 0
    @AppStorage(Pref.cellularBitRate) private var cellularBitRate = 0
    @State private var showingPlayerSettings = QuickSettings.startsInPlayerSettings
    let song: Song

    private static var startsInPlayerSettings: Bool {
        #if DEBUG
        DebugScreen.name == "playersettings"
        #else
        false
        #endif
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    RadioItem(song: song)
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
                Section("Player") {
                    PlayerStylePicker()
                    Button { showingPlayerSettings = true } label: { Label("Look, Gestures and Buttons", systemImage: "slider.horizontal.3") }
                    SleepTimerPicker()
                }
                Section {
                    Toggle("Infinite Play", isOn: $infinitePlay)
                    Picker("ReplayGain", selection: $replayGain) {
                        Text("Automatic").tag("auto")
                        Text("Per Song").tag("track")
                        Text("Per Album").tag("album")
                        Text("Off").tag("off")
                    }
                    Picker("Speed", selection: $speed) {
                        ForEach([0.75, 1, 1.25, 1.5, 2], id: \.self) { Text("\($0.formatted())×").tag($0) }
                    }
                    Toggle("Sync Queue Across Devices", isOn: $queueSync)
                } header: {
                    Text("Playback")
                } footer: {
                    if let device = player.mirror.playingOn {
                        Text("Playing on \(device.name). These apply when this iPhone plays.")
                    }
                }
                Section("Streaming and Cache") {
                    QualityPicker(title: "On Wi-Fi", value: $wifiBitRate)
                    QualityPicker(title: "On Cellular", value: $cellularBitRate)
                    CacheAheadPicker()
                }
                Section("Scrobbling") { ScrobbleRows() }
                if let source = lyrics.saved(song.id)?.lyrics.source {
                    Section {
                        LabeledContent("Lyrics From", value: source == "lrclib" ? "LRCLIB" : "Your Server")
                    } footer: {
                        Text("Your server picks where lyrics come from.")
                    }
                }
                Section {
                    NavigationLink { PlaybackSettings() } label: { Label("All Playback Settings", systemImage: "play.circle") }
                    NavigationLink { AppearanceSettings() } label: { Label("Appearance", systemImage: "paintpalette") }
                }
            }
            .navigationTitle(song.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done", systemImage: "checkmark") { dismiss() } }
            .navigationDestination(isPresented: $showingPlayerSettings) { PlayerSettings() }
        }
        .presentationDetents([.medium, .large])
    }
}
