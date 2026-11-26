import CoreSpotlight
import SwiftUI

/// The page a link or a Spotlight result asked for, kept until the tabs are there to show it.
@MainActor
final class Links: ObservableObject {
    @Published var pending: AppLink?
}

/// Opens what was asked for. Only on `MainView`, so nothing happens signed out.
struct OpensLinks: ViewModifier {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var links: Links
    @ObservedObject var router: Router

    func body(content: Content) -> some View {
        content.task(id: links.pending) {
            guard let link = links.pending else { return }
            // New on the server since the last sync, perhaps.
            if page(link) == nil { await model.sync() }
            guard !Task.isCancelled else { return }
            if let (tab, route) = page(link) {
                router.tab = tab
                router.open(route)
            } else {
                Popup.show("Not Found", message: "That isn't in your library on this iPhone.")
            }
            links.pending = nil
        }
    }

    private func page(_ link: AppLink) -> (AppTab, Route)? {
        switch link {
        case .album(let id): return model.album(id: id).map { (.library, .album($0)) }
        case .playlist(let id): return model.library.playlists.first { $0.id == id }.map { (.playlists, .playlist($0)) }
        }
    }
}

/// The playlists in the phone's own search. Signed out, there are none.
@MainActor
enum Spotlight {
    private static let domain = "playlists"
    private static var indexed: [String]?
    private static var work: Task<Void, Never>?

    static func show(_ playlists: [Playlist]) {
        let key = playlists.map { "\($0.id) \($0.songCount ?? 0) \($0.name)" }
        guard key != indexed else { return }
        indexed = key
        let items = playlists.map { playlist in
            let attributes = CSSearchableItemAttributeSet(contentType: .item)
            attributes.title = playlist.name
            attributes.contentDescription = playlist.songCount == 1 ? "Playlist, 1 song" : "Playlist, \(playlist.songCount ?? 0) songs"
            return CSSearchableItem(uniqueIdentifier: AppLink.spotlightID(playlist: playlist.id), domainIdentifier: domain, attributeSet: attributes)
        }
        let before = work
        work = Task {
            await before?.value
            do {
                let index = CSSearchableIndex.default()
                try await index.deleteSearchableItems(withDomainIdentifiers: [domain])
                try await index.indexSearchableItems(items)
            } catch {
                AppLog.shared.add("Spotlight not updated: \(error.localizedDescription)")
            }
        }
        // The names Siri and Shortcuts offer in "Play … in lodesong".
        LodesongShortcuts.updateAppShortcutParameters()
    }
}
