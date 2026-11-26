import Foundation

/// The Home sections of whoever is signed in, shared by Home and its "see all" pages.
@MainActor
final class HomeFeedModel: ObservableObject {
    static let shared = HomeFeedModel()

    @Published private(set) var feed = HomeFeed()
    private var file: URL?
    private var running: Task<Void, Never>?

    /// Reads the account's last copy from disk, before the first frame.
    func use(server: URL, user: String) {
        let next = URL.applicationSupportDirectory.appending(path: "Home/\(DownloadLibrary.folder(server: server, user: user)).json")
        guard next != file else { return }
        file = next
        feed = HomeFeed.load(next)
    }

    /// One at a time, so a refresh that started earlier never writes over a newer one.
    func refresh(_ client: ServerClient, reshuffle: Bool = false) async {
        let previous = running
        let task = Task {
            await previous?.value
            let asked = file
            let next = await feed.refreshed(from: client, reshuffle: reshuffle)
            // Another account may have signed in meanwhile.
            guard let asked, asked == file, next != feed else { return }
            feed = next
            next.save(asked)
        }
        running = task
        await task.value
    }
}
