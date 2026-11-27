import Foundation

/// The songs heard on this phone, newest first, kept across queues and restarts.
struct ListenHistory {
    static let limit = 200

    let folder: URL

    private struct Saved: Codable {
        var account: String
        var songs: [Song]
    }

    private var file: URL { folder.appendingPathComponent("listen-history.json") }

    /// Heard again, a song moves to the top.
    static func adding(_ song: Song, to songs: [Song]) -> [Song] {
        Array(([song] + songs.filter { $0.id != song.id }).prefix(limit))
    }

    /// Empty when nothing was saved, or it was saved by another account.
    func load(account: String) -> [Song] {
        guard let saved = (try? Data(contentsOf: file)).flatMap({ try? JSONDecoder().decode(Saved.self, from: $0) }),
              saved.account == account else { return [] }
        return saved.songs
    }

    func save(_ songs: [Song], account: String) {
        guard let data = try? JSONEncoder().encode(Saved(account: account, songs: songs)) else { return }
        #if os(iOS)
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try? data.write(to: file, options: .atomic)
        #endif
    }
}
