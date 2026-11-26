import SwiftUI

@MainActor
enum RadioActions {
    private static var busy = false

    /// Plays `first`, then songs like it.
    static func start(from seed: Song, first: Song, model: AppModel, player: PlayerModel) {
        guard !busy, let client = model.live else { return }
        busy = true
        Haptic.tap()
        Task {
            defer { busy = false }
            let more = await client.radio(from: seed, excluding: [first.id], count: 40)
            guard !more.isEmpty else { return Popup.show("Can't Start Radio", message: "Your server found no similar songs, or can't be reached.") }
            player.startRadio(first, more)
        }
    }
}

struct RadioItem: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    let song: Song

    var body: some View {
        Button("Start Radio", systemImage: "dot.radiowaves.left.and.right") {
            // The library's copy knows the artist and genre; an older queued one may not.
            let seed = model.library.songs.first { $0.id == song.id } ?? song
            RadioActions.start(from: seed, first: song, model: model, player: player)
        }
        .disabled(!model.canEdit)
    }
}

struct ArtistRadioItem: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    let artist: Artist

    var body: some View {
        Button("Start Artist Radio", systemImage: "dot.radiowaves.left.and.right") {
            guard let first = model.library.topSongs(artist: artist.id).first else {
                return Popup.show("Can't Start Radio", message: "There are no songs by \(artist.name) in your library.")
            }
            let seed = Song(id: "", title: "", artist: artist.name, artistId: artist.id, genre: first.genre)
            RadioActions.start(from: seed, first: first, model: model, player: player)
        }
        .disabled(!model.canEdit)
    }
}
