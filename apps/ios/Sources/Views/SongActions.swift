import SwiftUI
import UIKit

// What the song, album, artist and playlist menus do beyond playing.

/// A page over whatever is on screen, the player and its sheets included, which a menu can't present itself.
@MainActor
enum SheetPresenter {
    static func show(_ model: AppModel, _ player: PlayerModel, @ViewBuilder content: () -> some View) {
        let root = content()
            .modifier(AppLook())
            .environmentObject(model)
            .environmentObject(player)
            .environmentObject(model.downloads)
        Popup.top?.present(UIHostingController(rootView: root), animated: true)
    }
}

private struct AppLook: ViewModifier {
    @AppStorage(Pref.appearance) private var appearance = "system"
    @AppStorage(Pref.tint) private var tint = "red"
    @AppStorage(Pref.tintCustom) private var tintCustom = ""

    func body(content: Content) -> some View {
        content.tint(Theme.tint(tint, custom: tintCustom)).preferredColorScheme(Theme.colorScheme(appearance))
    }
}

@MainActor
enum Sharing {
    private static var busy = false

    /// The link is only made when asked for: each one is kept by the server until it is stopped or expires.
    static func share(kind: String, id: String, model: AppModel) {
        guard !busy, let client = model.live else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                let sheet = UIActivityViewController(activityItems: [try await client.shareLink(kind: kind, id: id)], applicationActivities: nil)
                guard let top = Popup.top else { return }
                // An iPad shows it as a popover, which has to come from somewhere.
                sheet.popoverPresentationController?.sourceView = top.view
                sheet.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
                sheet.popoverPresentationController?.permittedArrowDirections = []
                top.present(sheet, animated: true)
            } catch {
                Popup.show("Can't Share", message: error.localizedDescription)
            }
        }
    }
}

struct ShareItem: View {
    @EnvironmentObject private var model: AppModel
    /// `song`, `album`, `artist` or `playlist`.
    let kind: String
    let id: String

    var body: some View {
        Button("Share Link", systemImage: "square.and.arrow.up") { Sharing.share(kind: kind, id: id, model: model) }
            .disabled(!model.canEdit)
    }
}

/// Like and rating, for a song, or an album or artist through `markable`. Works offline: `SongMarks` sends them later.
struct MarkItems: View {
    @EnvironmentObject private var player: PlayerModel
    let item: Song

    var body: some View {
        let liked = player.isLiked(item)
        Button(liked ? "Undo Like" : "Like", systemImage: liked ? "heart.slash" : "heart") {
            Haptic.tap()
            player.setLiked(item, !liked)
        }
        Picker(selection: Binding { player.rating(item) } set: { player.rate(item, $0) }) {
            Text("No Rating").tag(0)
            ForEach(1...5, id: \.self) { Text(String(repeating: "★", count: $0)).tag($0) }
        } label: {
            Label("Rating", systemImage: "star")
        }
        .pickerStyle(.menu)
    }
}

struct AddToPlaylistItem: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    /// Read when tapped, not while the list is drawn.
    let songs: () -> [Song]

    var body: some View {
        Button {
            let songs = songs()
            guard !songs.isEmpty else { return Popup.show("Nothing to Add", message: "There are no songs here.") }
            SheetPresenter.show(model, player) { AddToPlaylistView(songs: songs) }
        } label: {
            Label("Add to Playlist", systemImage: "text.badge.plus")
            if !model.canEdit { Text("Needs a connection") }
        }
        .disabled(!model.canEdit)
    }
}

/// Edit and delete, only on playlists this account may change.
struct PlaylistEditItems: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    let playlist: Playlist

    var body: some View {
        if playlist.editable(by: model.user) {
            Button {
                SheetPresenter.show(model, player) { PlaylistEditorView(playlist: playlist, songs: model.entries(playlist: playlist.id)) }
            } label: {
                Label("Edit Playlist", systemImage: "pencil")
                if !model.canEdit { Text("Needs a connection") }
            }
            .disabled(!model.canEdit)
            Button("Delete Playlist", systemImage: "trash", role: .destructive) { PlaylistActions.delete(playlist, model: model) }
                .disabled(!model.canEdit)
        }
    }
}

@MainActor
enum PlaylistActions {
    static func delete(_ playlist: Playlist, model: AppModel, then: @escaping () -> Void = {}) {
        let downloaded = model.downloads.state(playlist: playlist.id) != .none
        Popup.show(
            "Delete “\(playlist.name)”?",
            message: "It's deleted from the server for every device\(downloaded ? ", and its download is removed from this iPhone" : ""). The songs stay in your library.",
            action: "Delete", destructive: true
        ) {
            run("Can't Delete") {
                try await model.editPlaylists(playlist.id) { try await $0.deletePlaylist(playlist.id); return nil }
                model.downloads.remove(playlist: playlist.id)
                then()
            }
        }
    }

    /// `index` is the song's place in the playlist's own order.
    static func remove(at index: Int, of songs: [Song], from playlist: Playlist, model: AppModel) {
        guard songs.indices.contains(index) else { return }
        Popup.show("Remove from “\(playlist.name)”?", message: songs[index].title, action: "Remove", destructive: true) {
            let old = songs.map(\.id)
            var new = old
            new.remove(at: index)
            run("Can't Remove") {
                try await model.editPlaylists(playlist.id) { try await $0.changeSongs(playlist: playlist.id, from: old, to: new); return nil }
            }
        }
    }

    private static func run(_ failure: String, _ work: @escaping () async throws -> Void) {
        Task {
            do {
                try await work()
                Haptic.done()
            } catch {
                Popup.show(failure, message: error.localizedDescription)
            }
        }
    }
}
