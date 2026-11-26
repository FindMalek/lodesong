import AppIntents
import Foundation

// What Shortcuts, Siri and Spotlight can do. `MarkRefreshedIntent` stays in `Notices.swift`, under the same name:
// the daily refresh shortcut people already made is tied to it.

enum ShortcutError: Error, CustomLocalizedStringResourceConvertible {
    case signedOut, gone, empty, notDownloaded, unreachable, nothingPlaying

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .signedOut: return "Open lodesong and sign in first."
        case .gone: return "That isn't in your lodesong library any more."
        case .empty: return "That playlist is empty."
        case .notDownloaded: return "You're offline, and that isn't downloaded to this iPhone."
        case .unreachable: return "lodesong can't play that right now. Check your server."
        case .nothingPlaying: return "Nothing is playing in lodesong."
        }
    }
}

@MainActor
private func signedIn() throws -> (AppModel, PlayerModel) {
    // An intent can launch the app with no window, so the wiring the window does may not have happened.
    AppServices.start()
    guard !AppServices.model.needsSignIn else { throw ShortcutError.signedOut }
    return (AppServices.model, AppServices.player)
}

struct PlaylistEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Playlist"
    static let defaultQuery = PlaylistQuery()
    let id: String
    let name: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }

    init(_ playlist: Playlist) {
        id = playlist.id
        name = playlist.name
    }
}

struct PlaylistQuery: EntityStringQuery {
    @MainActor private var playlists: [Playlist] { AppServices.model.library.playlists }

    /// Answers signed out too, so running a saved shortcut gets as far as saying "sign in".
    @MainActor func entities(for identifiers: [String]) async throws -> [PlaylistEntity] {
        playlists.filter { identifiers.contains($0.id) }.map(PlaylistEntity.init)
    }

    @MainActor func entities(matching string: String) async throws -> [PlaylistEntity] {
        try await suggestedEntities().filter { $0.name.localizedStandardContains(string) }
    }

    @MainActor func suggestedEntities() async throws -> [PlaylistEntity] {
        AppServices.model.needsSignIn ? [] : playlists.map(PlaylistEntity.init)
    }
}

struct SongEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Song"
    static let defaultQuery = SongQuery()
    let id: String
    let title: String
    let artist: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)", subtitle: "\(artist)") }

    init(_ song: Song) {
        id = song.id
        title = song.title
        artist = song.artist ?? ""
    }
}

struct SongQuery: EntityStringQuery {
    @MainActor func entities(for identifiers: [String]) async throws -> [SongEntity] {
        let wanted = Set(identifiers)
        return AppServices.model.library.songs.filter { wanted.contains($0.id) }.map(SongEntity.init)
    }

    @MainActor func entities(matching string: String) async throws -> [SongEntity] {
        guard !AppServices.model.needsSignIn else { return [] }
        return AppServices.model.library.songs.lazy.filter { $0.matches(string) }.prefix(30).map(SongEntity.init)
    }

    /// The liked ones: a whole library is too long to choose from without typing.
    @MainActor func suggestedEntities() async throws -> [SongEntity] {
        guard !AppServices.model.needsSignIn else { return [] }
        return AppServices.model.library.songs.lazy.filter { $0.starred != nil }.prefix(30).map(SongEntity.init)
    }
}

struct PlayPlaylistIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "Play Playlist"
    static let description = IntentDescription("Plays one of your lodesong playlists.")
    static var parameterSummary: some ParameterSummary { Summary("Play \(\.$playlist)") }

    @Parameter(title: "Playlist") var playlist: PlaylistEntity

    @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
        let (model, player) = try signedIn()
        guard model.library.playlists.contains(where: { $0.id == playlist.id }) else { throw ShortcutError.gone }
        let songs = model.entries(playlist: playlist.id)
        guard !songs.isEmpty else { throw ShortcutError.empty }
        let device = try await player.playForShortcut(songs)
        return .result(dialog: device.map { "Playing \(playlist.name) on \($0)." } ?? "Playing \(playlist.name).")
    }
}

struct PlaySongIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "Play Song"
    static let description = IntentDescription("Plays a song from your lodesong library.")
    static var parameterSummary: some ParameterSummary { Summary("Play \(\.$song)") }

    @Parameter(title: "Song") var song: SongEntity

    @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
        let (model, player) = try signedIn()
        guard let found = model.library.songs.first(where: { $0.id == song.id }) else { throw ShortcutError.gone }
        let device = try await player.playForShortcut([found])
        return .result(dialog: device.map { "Playing \(found.title) on \($0)." } ?? "Playing \(found.title).")
    }
}

/// Likes or unlikes what is on, here or on the device that plays. Offline it is kept and sent later.
@MainActor
private func markCurrentSong(liked: Bool) async throws -> IntentDialog {
    let (model, player) = try signedIn()
    guard let song = await player.songForShortcut() else { throw ShortcutError.nothingPlaying }
    player.setLiked(song, liked)
    let done = liked ? "Liked \(song.title)." : "Removed the like from \(song.title)."
    return model.offlineMode || !player.hasNetwork ? "\(done) It's sent when your server can be reached." : "\(done)"
}

struct LikeSongIntent: AppIntent {
    static let title: LocalizedStringResource = "Like Current Song"
    static let description = IntentDescription("Likes the song lodesong is on.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: try await markCurrentSong(liked: true))
    }
}

struct UnlikeSongIntent: AppIntent {
    static let title: LocalizedStringResource = "Unlike Current Song"
    static let description = IntentDescription("Removes the like from the song lodesong is on.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: try await markCurrentSong(liked: false))
    }
}

struct LodesongShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: PlayPlaylistIntent(),
            phrases: ["Play a playlist in \(.applicationName)", "Play \(\.$playlist) in \(.applicationName)"],
            shortTitle: "Play Playlist", systemImageName: "music.note.list"
        )
        AppShortcut(intent: PlaySongIntent(), phrases: ["Play a song in \(.applicationName)"], shortTitle: "Play Song", systemImageName: "music.note")
        AppShortcut(intent: LikeSongIntent(), phrases: ["Like this song in \(.applicationName)"], shortTitle: "Like Current Song", systemImageName: "heart")
        AppShortcut(intent: UnlikeSongIntent(), phrases: ["Unlike this song in \(.applicationName)"], shortTitle: "Unlike Current Song", systemImageName: "heart.slash")
    }
}
