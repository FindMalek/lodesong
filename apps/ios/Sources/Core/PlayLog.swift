import Foundation

/// What became of something sent to the server.
enum Delivery {
    case done
    /// The server will never take it; keeping it would block everything behind it.
    case refused
    case later
}

/// One play, from the moment the song was first heard until the server has it.
struct LoggedPlay: Codable, Equatable {
    /// Sent with every attempt, so the server records it once.
    let key: String
    let account: String
    let song: Song
    /// Ms since the epoch.
    let started: Int
    /// Seconds actually listened: seeking ahead and waiting don't count.
    var listened: Double = 0
    var position: Double
    var duration: Double
    var heard: Date
    /// Past the scrobble point, so Navidrome counts it.
    var counts = false
    var ended = false
    var scrobbled = false
    var recorded = false

    var finished: Bool { duration > 0 && position >= duration - 3 }
}

/// Every play is written to disk as it happens and sent when the server can be reached.
@MainActor
final class PlayLog {
    private(set) var plays: [LoggedPlay]
    private let file: URL
    private let now: () -> Date
    /// The play the player is on in this run of the app.
    private var live: String?
    private var mark: (position: Double, at: Date)?
    private var flushing = false
    /// A play nobody carried on for this long is over: the app was closed in the middle of it.
    private static let idle: TimeInterval = 30 * 60

    init(folder: URL, now: @escaping () -> Date = Date.init) {
        file = folder.appendingPathComponent("plays.json")
        self.now = now
        plays = (try? JSONDecoder().decode([LoggedPlay].self, from: Data(contentsOf: file))) ?? []
    }

    /// Call while `song` is audibly playing.
    func hear(_ song: Song, account: String, position: Double, duration: Double) {
        let time = now()
        if index(live).map({ plays[$0].song.id != song.id || plays[$0].account != account }) ?? true {
            begin(song, account: account, position: position)
        }
        guard let at = index(live) else { return }
        if let mark {
            let step = position - mark.position
            // More than the time that passed is a jump, not listening.
            if step > 0, step <= time.timeIntervalSince(mark.at) + 1 { plays[at].listened += step }
        }
        plays[at].position = position
        plays[at].duration = duration
        plays[at].heard = time
        mark = (position, time)
    }

    func jumped(to position: Double) {
        mark = (position, now())
    }

    /// The current play is long enough to count.
    func count() {
        guard let at = index(live), !plays[at].counts else { return }
        plays[at].counts = true
        save()
    }

    /// The player left this play: the next one heard is a new one.
    func end() {
        if let at = index(live) { close(at) }
        live = nil
        mark = nil
        save()
    }

    func save() {
        plays.removeAll { $0.ended && $0.recorded && ($0.scrobbled || !$0.counts) }
        try? JSONEncoder().encode(plays).write(to: file, options: .atomic)
    }

    /// Oldest first, stopping at the first one that has to wait. `valid` turns false once `client` is no longer signed in as `account`.
    func flush(_ server: ServerClient, account: String, client: String, valid: () -> Bool = { true }) async {
        guard !flushing else { return }
        flushing = true
        defer { flushing = false }
        for at in plays.indices where !plays[at].ended && plays[at].key != live && now().timeIntervalSince(plays[at].heard) > Self.idle {
            close(at)
        }
        save()
        while valid(), let play = plays.first(where: { $0.account == account && (($0.counts && !$0.scrobbled) || ($0.ended && !$0.recorded)) }) {
            let scrobble = play.counts && !play.scrobbled
            let result = scrobble
                ? await server.scrobble(song: play.song.id, submission: true, time: play.started, client: client)
                : await server.addPlay(play, client: client)
            guard result != .later, let at = index(play.key) else { return }
            if scrobble { plays[at].scrobbled = true } else { plays[at].recorded = true }
            save()
        }
    }

    private func begin(_ song: Song, account: String, position: Double) {
        let time = now()
        mark = nil
        // Picking up where a closed app left off is the same play, not a second one.
        if let at = plays.lastIndex(where: { !$0.ended && $0.account == account && $0.song.id == song.id && abs($0.position - position) < 10 }) {
            live = plays[at].key
        } else {
            for at in plays.indices where !plays[at].ended { close(at) }
            let play = LoggedPlay(key: UUID().uuidString, account: account, song: song, started: Int(time.timeIntervalSince1970 * 1000),
                                  position: position, duration: Double(song.duration ?? 0), heard: time)
            plays.append(play)
            live = play.key
        }
        save()
    }

    private func close(_ at: Int) {
        plays[at].ended = true
        // Under a second is a song passed over, as in the web player.
        if plays[at].listened < 1 { plays[at].recorded = true }
    }

    private func index(_ key: String?) -> Int? {
        plays.firstIndex { $0.key == key }
    }
}
