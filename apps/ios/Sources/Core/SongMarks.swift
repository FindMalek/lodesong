import Foundation

/// A like or a rating changed on this phone.
struct MarkChange: Codable, Equatable {
    enum Kind: String, Codable { case like, rating }

    let account: String
    let song: String
    let kind: Kind
    /// One or zero for a like, the number of stars for a rating.
    var value: Int
    /// When the server took it. Kept until a later library sync says the same.
    var sent: Date?
    /// The last try didn't get through.
    var failed = false
}

/// Likes and ratings are written to disk first and sent when the server can be reached,
/// so they show at once and survive being offline.
@MainActor
final class SongMarks {
    private(set) var changes: [MarkChange]
    private let file: URL
    private let now: () -> Date
    private var flushing = false

    init(folder: URL, now: @escaping () -> Date = Date.init) {
        file = folder.appendingPathComponent("marks.json")
        self.now = now
        changes = (try? JSONDecoder().decode([MarkChange].self, from: Data(contentsOf: file))) ?? []
    }

    func liked(_ song: Song, account: String) -> Bool {
        find(.like, song.id, account).map { changes[$0].value != 0 } ?? (song.starred != nil)
    }

    func rating(_ song: Song, account: String) -> Int {
        find(.rating, song.id, account).map { changes[$0].value } ?? song.userRating ?? 0
    }

    func hasUnsent(account: String) -> Bool {
        changes.contains { $0.account == account && $0.sent == nil }
    }

    func waiting(song: String, account: String, offline: Bool) -> Bool {
        changes.contains { $0.song == song && $0.account == account && $0.sent == nil && (offline || $0.failed) }
    }

    /// Only the last value counts, so liking and unliking offline sends one request.
    func set(_ kind: MarkChange.Kind, _ value: Int, song: String, account: String) {
        if let at = find(kind, song, account) { changes.remove(at: at) }
        changes.append(MarkChange(account: account, song: song, kind: kind, value: value))
        save()
    }

    /// Oldest first, stopping at the first one that has to wait.
    func flush(_ server: ServerClient, account: String, client: String, valid: () -> Bool = { true }) async {
        guard !flushing else { return }
        flushing = true
        defer { flushing = false }
        while valid(), let change = changes.first(where: { $0.account == account && $0.sent == nil }) {
            let result = change.kind == .like
                ? await server.setLiked(song: change.song, change.value != 0, client: client)
                : await server.setRating(song: change.song, change.value, client: client)
            // Changed again while it was on the way: the new value goes next.
            guard let at = find(change.kind, change.song, account), changes[at].value == change.value else { continue }
            switch result {
            case .done: changes[at].sent = now()
            case .refused: changes.remove(at: at)
            case .later:
                // Everything behind it waits too.
                for i in changes.indices where changes[i].account == account && changes[i].sent == nil { changes[i].failed = true }
                return save()
            }
            save()
        }
    }

    /// A sync that began after a change was sent already carries it, or something newer from elsewhere.
    func settle(account: String, sentBefore date: Date) {
        changes.removeAll { change in change.account == account && change.sent.map { $0 < date } == true }
        save()
    }

    private func find(_ kind: MarkChange.Kind, _ song: String, _ account: String) -> Int? {
        changes.firstIndex { $0.kind == kind && $0.song == song && $0.account == account }
    }

    private func save() {
        try? JSONEncoder().encode(changes).write(to: file, options: .atomic)
    }
}
