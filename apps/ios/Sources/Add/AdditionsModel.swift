import Foundation

/// What was added from this phone, kept across launches and followed while the app is open.
@MainActor
final class AdditionsModel: ObservableObject {
    /// Cleared with the other per account views (`AccountData`).
    static let key = "additions"

    @Published private(set) var items: [Addition] = []
    /// Whether the server lets this account add music. False until it says so.
    @Published private(set) var available = false

    var unsettled: Bool { items.contains(where: \.unsettled) }
    /// Each new round restarts `follow`, with its full time again.
    @Published private(set) var round = 0

    func restart() { round += 1 }

    func load() {
        let data = UserDefaults.standard.data(forKey: Self.key) ?? Data()
        items = (try? JSONDecoder().decode([Addition].self, from: data)) ?? []
        // Each launch looks again for what the library didn't show last time.
        for index in items.indices { items[index].looks = 0 }
    }

    /// No answer keeps what was last heard.
    func check(_ app: AppModel) async {
        guard let client = app.live, !app.needsSignIn, let answer = try? await client.canAddMusic() else { return }
        available = answer
    }

    func add(_ wish: Wish, input: String, client: ServerClient) async throws {
        let addition = try await client.addMusic(wish, input: input)
        items.removeAll { $0.id == addition.id || $0.input == input }
        items = Array(([addition] + items).prefix(20))
        save()
        restart()
    }

    func addition(_ input: String) -> Addition? { items.first { $0.input == input } }

    /// Only forgets it here: Lyterion carries on.
    func remove(_ id: String) {
        items.removeAll { $0.id == id }
        save()
    }

    func lookAgain(_ id: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].looks = 0
        restart()
    }

    /// Polls until nothing is left to wait for. A server that can't answer is asked again.
    func follow(_ app: AppModel) async {
        // Same limit as the web player, so a stuck download can't poll all night. The next launch looks again.
        let deadline = Date.now.addingTimeInterval(30 * 60)
        var pause = 3.0
        while !Task.isCancelled, unsettled, Date.now < deadline, let client = app.live {
            var answered = false
            for item in items where item.unsettled {
                guard let next = try? await client.advanced(item), !Task.isCancelled,
                      let index = items.firstIndex(where: { $0.id == item.id }) else { continue }
                answered = true
                items[index] = next
                save()
                let found = next.song != nil && item.song == nil
                // With no artist there is nothing to look for, so one sync has to do.
                if found || (next.status == .placed && item.status != .placed && next.wish.artists.isEmpty) {
                    bringIn(next.song?.id, app)
                }
            }
            // A server that doesn't answer is asked less and less often.
            pause = answered ? 3 : min(pause * 2, 60)
            try? await Task.sleep(for: .seconds(pause))
        }
    }

    private func bringIn(_ id: String?, _ app: AppModel) {
        Task {
            await app.sync()
            // A sync already under way may have started before the scan.
            if let id, !app.library.songs.contains(where: { $0.id == id }) { await app.sync() }
        }
    }

    private func save() {
        UserDefaults.standard.set(try? JSONEncoder().encode(items), forKey: Self.key)
    }
}
