import SwiftUI

/// Behind the "..." on now playing: the song's actions, and the settings that act on what you see and hear.
struct QuickSettings: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var lyrics: LyricsModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage(Pref.replayGain) private var replayGain = "auto"
    @AppStorage(Pref.infinitePlay) private var infinitePlay = false
    @AppStorage(Pref.queueSync) private var queueSync = true
    @State private var showingPlayerSettings = QuickSettings.startsInPlayerSettings
    let song: Song
    /// Lyrics, queue or devices, which stay reachable here when their bottom button is hidden.
    let open: (PlayerButton) -> Void

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
                    Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext([song]) }
                    Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast([song]) }
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
                Section {
                    show("Lyrics", "quote.bubble", .lyrics)
                    show("Queue", "list.bullet", .queue)
                    show("AirPlay and Devices", "airplayaudio", .airplay)
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
                    SpeedRows()
                    Toggle("Sync Queue Across Devices", isOn: $queueSync)
                } header: {
                    Text("Playback")
                } footer: {
                    if let device = player.mirror.playingOn {
                        Text("Playing on \(device.name). These apply when this iPhone plays.")
                    }
                }
                Section("Streaming Quality") { StreamingRows() }
                Section {
                    SongCacheRows()
                } header: {
                    Text("Song Cache")
                } footer: {
                    Text("Changing the type empties the cache. Your downloads are not touched.")
                }
                Section("Scrobbling") { ScrobbleRows() }
                Section("Lyrics") {
                    LyricsSourcePicker()
                    if let source = lyrics.saved(song.id)?.lyrics.source {
                        LabeledContent("Lyrics From", value: source == "lrclib" ? "LRCLIB" : "Your Server")
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

    private func show(_ title: String, _ symbol: String, _ button: PlayerButton) -> some View {
        Button(title, systemImage: symbol) {
            open(button)
            dismiss()
        }
    }
}
