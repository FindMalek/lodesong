import SwiftUI
import UIKit

extension Color {
    static let accent = Color(red: 0.98, green: 0.18, blue: 0.33)
}

/// A playlist's own cover, or four of its albums.
struct PlaylistCover: View {
    @EnvironmentObject private var model: AppModel
    let playlist: Playlist
    var size = 400
    var radius: CGFloat = 10
    @State private var covers: [String] = []

    var body: some View {
        Group {
            if let choice = model.library.shelf.cover(playlist: playlist.id) {
                PictureCover(seed: "playlist:\(playlist.id)", version: choice.kind == "image" ? choice.version : nil, radius: radius)
            } else if playlist.coverArt == nil && covers.count == 4 {
                Grid(horizontalSpacing: 0, verticalSpacing: 0) {
                    ForEach([0, 2], id: \.self) { row in
                        GridRow {
                            Artwork(id: covers[row], size: size / 2, radius: 0)
                            Artwork(id: covers[row + 1], size: size / 2, radius: 0)
                        }
                    }
                }
                .aspectRatio(1, contentMode: .fit)
                .clipShape(.rect(cornerRadius: radius))
                .accessibilityHidden(true)
            } else {
                Artwork(id: playlist.coverArt ?? covers.first, symbol: "music.note.list", size: size, radius: radius)
            }
        }
        .task(id: model.syncing) {
            guard playlist.coverArt == nil else { return }
            var seen = Set<String>()
            covers = Array(model.entries(playlist: playlist.id).compactMap(\.coverArt).filter { seen.insert($0).inserted }.prefix(4))
        }
    }
}

enum Haptic {
    @MainActor static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    @MainActor static func done() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

extension AppModel {
    /// Offline mode, or the last sync failed so streaming probably will too.
    var offline: Bool { offlineMode || syncError != nil }

    func artist(id: String?) -> Artist? { id.flatMap { id in library.artists.first { $0.id == id } } }
    func album(id: String?) -> Album? { id.flatMap { id in library.albums.first { $0.id == id } } }
}

/// Searches, plays and covers belong to whoever was signed in; the next account starts clean.
enum AccountData {
    @MainActor static func adopt(_ account: String) {
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: "viewsAccount") != account else { return }
        defaults.set(account, forKey: "viewsAccount")
        defaults.removeObject(forKey: Recents.key)
        defaults.removeObject(forKey: "recentSearches")
        ArtworkCache.shared.clear()
    }
}

/// Albums played from this phone, newest first.
enum Recents {
    static let key = "recentAlbums"

    static func add(_ id: String?) {
        guard let id else { return }
        let ids = [id] + ids(UserDefaults.standard.string(forKey: key) ?? "").filter { $0 != id }
        UserDefaults.standard.set(ids.prefix(20).joined(separator: "\n"), forKey: key)
    }

    static func ids(_ raw: String) -> [String] { raw.split(separator: "\n").map(String.init) }
}

extension PlayerModel {
    /// `then` runs once they play, which waits for any question asked first.
    func start(_ songs: [Song], at index: Int = 0, then: @escaping () -> Void = {}) {
        guard songs.indices.contains(index) else { return }
        replacing(songs) {
            Recents.add(songs[index].albumId)
            self.play(songs, at: index)
            then()
        }
    }

    func startShuffled(_ songs: [Song]) {
        guard !songs.isEmpty else { return }
        replacing(songs) { self.shuffle(songs) }
    }

    /// Asks first when Settings says so, and says why nothing plays when offline has none of it.
    private func replacing(_ songs: [Song], _ play: @escaping () -> Void) {
        Haptic.tap()
        if UserDefaults.standard.bool(Pref.offlineMode, or: false), !songs.contains(where: { localFile($0.id) != nil }) {
            return Popup.show("Not on This iPhone", message: "Offline Mode only plays downloaded songs.")
        }
        guard UserDefaults.standard.bool(Pref.confirmReplace, or: false), wouldReplace(songs) else { return play() }
        Popup.show("Replace the Queue?", message: "The songs still to come are dropped.", action: "Replace", perform: play)
    }

    func queueNext(_ songs: [Song]) {
        Haptic.done()
        playNext(songs)
    }

    func queueLast(_ songs: [Song]) {
        Haptic.done()
        addToQueue(songs)
    }
}

func timeText(_ seconds: TimeInterval) -> String {
    let total = max(0, Int(seconds.isFinite ? seconds : 0))
    let tail = String(format: "%02d", total % 60)
    return total >= 3600 ? "\(total / 3600):" + String(format: "%02d", total / 60 % 60) + ":\(tail)" : "\(total / 60):\(tail)"
}

func summaryText(_ songs: [Song]) -> String {
    let minutes = songs.reduce(0) { $0 + ($1.duration ?? 0) } / 60
    let count = songs.count == 1 ? "1 song" : "\(songs.count) songs"
    guard minutes > 0 else { return count }
    return count + ", " + (minutes >= 60 ? "\(minutes / 60) hr \(minutes % 60) min" : "\(minutes) min")
}

struct SongMenu: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var router: Router
    let song: Song

    var body: some View {
        Button("Play", systemImage: "play") { player.start([song]) }
        Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext([song]) }
        Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast([song]) }
        Divider()
        if let album = model.album(id: song.albumId) {
            Button("Go to Album", systemImage: "square.stack") { router.open(.album(album)) }
            if let artist = model.artist(id: album.artistId) {
                Button("Go to Artist", systemImage: "music.mic") { router.open(.artist(artist)) }
            }
        }
    }
}

/// What a long press lifts out of a list or grid.
/// A context menu preview gets none of the environment, so the model is handed in.
struct PreviewCard: View {
    let model: AppModel
    var cover: String?
    var playlist: Playlist?
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Group {
                if let playlist {
                    PlaylistCover(playlist: playlist, size: 600, radius: 12)
                } else {
                    Artwork(id: cover, size: 600, radius: 12)
                }
            }
            .padding(.bottom, 6)
            Text(title).font(.headline).lineLimit(2)
            if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1) }
        }
        .padding(16)
        .frame(width: 280)
        .environmentObject(model)
    }
}

/// What a swipe on a song row does.
enum SwipeAction: String, CaseIterable {
    case playNext, addToQueue, none

    var title: String { self == .playNext ? "Play Next" : self == .addToQueue ? "Add to Queue" : "Nothing" }
}

/// A song in any list: tap to play, swipe to queue, hold for more.
struct SongRow: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var player: PlayerModel
    @EnvironmentObject private var downloads: DownloadsModel
    let songs: [Song]
    let index: Int
    /// Album pages number their rows instead of repeating one cover.
    var numbered = false
    /// Under the title: the album instead of the artist, on the artist's own page.
    var showsAlbum = false
    @AppStorage(Pref.swipeLeading) private var swipeLeading = SwipeAction.playNext
    @AppStorage(Pref.swipeTrailing) private var swipeTrailing = SwipeAction.addToQueue

    private var song: Song { songs[index] }
    private var local: Bool { downloads.localURL(song: song.id) != nil }
    private var current: Bool { player.playback(model.library).current?.id == song.id }

    var body: some View {
        HStack(spacing: 12) {
            Button {
                player.start(songs, at: index)
            } label: {
                HStack(spacing: 12) {
                    leading
                    VStack(alignment: .leading, spacing: 2) {
                        Text(song.title).lineLimit(1).foregroundStyle(current ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
                        if !numbered, let subtitle = showsAlbum ? song.album : song.artist {
                            Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                    if local {
                        Image(systemName: "arrow.down.circle.fill").font(.caption).foregroundStyle(.secondary).accessibilityLabel("Downloaded")
                    }
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            Menu {
                SongMenu(song: song)
            } label: {
                Image(systemName: "ellipsis").frame(width: 32, height: 32).contentShape(.rect)
            }
            .foregroundStyle(.primary)
            .accessibilityLabel("More")
        }
        .opacity(model.offline && !local ? 0.45 : 1)
        .swipeActions(edge: .leading) { swipeButton(swipeLeading) }
        .swipeActions(edge: .trailing) { swipeButton(swipeTrailing) }
        .contextMenu {
            SongMenu(song: song)
        } preview: {
            PreviewCard(model: model, cover: song.coverArt, title: song.title, subtitle: song.artist)
        }
    }

    @ViewBuilder private func swipeButton(_ action: SwipeAction) -> some View {
        switch action {
        case .playNext:
            Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { player.queueNext([song]) }.tint(.indigo)
        case .addToQueue:
            Button("Add to Queue", systemImage: "text.line.last.and.arrowtriangle.forward") { player.queueLast([song]) }.tint(.orange)
        case .none:
            EmptyView()
        }
    }

    @ViewBuilder private var leading: some View {
        if numbered {
            Group {
                if current {
                    Image(systemName: "waveform").foregroundStyle(.tint)
                } else {
                    Text(song.track.map(String.init) ?? "–").foregroundStyle(.secondary).monospacedDigit()
                }
            }
            .frame(minWidth: 28)
        } else {
            Artwork(id: song.coverArt, size: 120, radius: 6).frame(width: 48, height: 48)
        }
    }
}

struct PlayShuffleButtons: View {
    @EnvironmentObject private var player: PlayerModel
    let songs: [Song]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) { buttons }
            VStack(spacing: 8) { buttons }
        }
        .disabled(songs.isEmpty)
    }

    @ViewBuilder private var buttons: some View {
        button("Play", symbol: "play.fill") { player.start(songs) }
        button("Shuffle", symbol: "shuffle") { player.startShuffled(songs) }
    }

    private func button(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: symbol).accessibilityHidden(true)
                Text(title).lineLimit(1).fixedSize()
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(Color(.secondarySystemFill), in: .rect(cornerRadius: 12))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.tint)
    }
}

/// Keeps an album or playlist on the phone.
struct DownloadButton: View {
    @EnvironmentObject private var model: AppModel
    @State private var confirming = false
    @EnvironmentObject private var downloads: DownloadsModel
    let state: DownloadState
    let keep: () -> Void
    let remove: () -> Void

    var body: some View {
        switch state {
        case .none:
            Button("Download", systemImage: "arrow.down") { Haptic.tap(); keep() }.disabled(model.offline)
        case .downloading(let done, let total):
            Menu {
                if done == 0 {
                    Button("Cancel Download", systemImage: "xmark", role: .destructive, action: remove)
                } else {
                    // Files are already here (a kept playlist that grew, say), so this is not a harmless cancel.
                    Text("\(done) of \(total) songs on this iPhone")
                    Button("Remove Download", systemImage: "trash", role: .destructive) { confirming = true }
                }
            } label: {
                ProgressView(value: Double(done), total: Double(max(total, 1))).progressViewStyle(.circular)
            }
            .accessibilityLabel("Downloading \(done) of \(total)")
            .confirmationDialog("Delete the \(done) downloaded songs?", isPresented: $confirming, titleVisibility: .visible) {
                Button("Remove Download", role: .destructive, action: remove)
            }
        case .downloaded:
            Menu("Downloaded", systemImage: "checkmark.circle.fill") {
                Button("Remove Download", systemImage: "trash", role: .destructive, action: remove)
            }
        }
    }
}

struct OfflineNotice: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let error = model.offlineMode ? "Only downloaded songs play." : model.syncError {
            HStack(spacing: 12) {
                Image(systemName: "wifi.slash").font(.title3).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.offlineMode ? "Offline Mode" : "Offline").font(.subheadline.bold())
                    Text(error).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 0)
                Button(model.offlineMode ? "Go Online" : "Retry") {
                    if model.offlineMode { model.offlineMode = false } else { Task { await model.sync() } }
                }
                .font(.subheadline.bold())
                .disabled(model.syncing)
            }
            .padding(14)
            .background(Color(.secondarySystemFill), in: .rect(cornerRadius: 16))
        }
    }
}

/// Covers a library screen while there is nothing to show: first sync, failed first sync, or an empty server.
struct LibraryState: ViewModifier {
    @EnvironmentObject private var model: AppModel
    let isEmpty: Bool
    let title: String
    let symbol: String

    func body(content: Content) -> some View {
        content.overlay {
            if isEmpty {
                Group {
                    if model.syncing {
                        ProgressView("Getting your library…").controlSize(.large)
                    } else if let error = model.syncError {
                        ContentUnavailableView {
                            Label("Can't Load Your Library", systemImage: "wifi.exclamationmark")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Try Again") { Task { await model.sync() } }.buttonStyle(.glassProminent)
                        }
                    } else {
                        ContentUnavailableView(title, systemImage: symbol, description: Text("Add music to your server, then pull to refresh."))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemBackground))
            }
        }
    }
}

extension View {
    func libraryState(_ isEmpty: Bool, _ title: String, _ symbol: String) -> some View {
        modifier(LibraryState(isEmpty: isEmpty, title: title, symbol: symbol))
    }
}
