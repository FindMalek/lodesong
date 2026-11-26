#if DEBUG
import SwiftUI
import UIKit

/// Screenshot helpers, never in a release build.
/// `LODESONG_SCREEN` opens a screen, `LODESONG_SAMPLE=1` fakes a playing queue and coloured covers.
enum DebugScreen {
    static let name = ProcessInfo.processInfo.environment["LODESONG_SCREEN"]
    static let sample = ProcessInfo.processInfo.environment["LODESONG_SAMPLE"] == "1"

    static func playback(_ library: Library) -> Playback? {
        guard sample, let album = library.albums.first else { return nil }
        var queue = library.songs(album: album.id)
        queue += library.songs.dropFirst(40).prefix(12)
        guard queue.count > 3 else { return nil }
        return Playback(queue: queue, index: 2, isPlaying: true)
    }

    static func progress(_ library: Library) -> (TimeInterval, TimeInterval)? {
        guard let song = playback(library)?.current else { return nil }
        let length = TimeInterval(song.duration ?? 215)
        return (length * 0.38, length)
    }

    /// Made up abstract covers: the mock server only serves grey squares.
    static func art(_ id: String) -> UIImage {
        var seed = id.unicodeScalars.reduce(UInt64(1469598103934665603)) { ($0 ^ UInt64($1.value)) &* 1099511628211 }
        func random() -> CGFloat {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return CGFloat(seed >> 33) / CGFloat(UInt32.max >> 1)
        }
        let hue = random()
        let size = CGSize(width: 400, height: 400)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(hue: hue, saturation: 0.55, brightness: 0.75, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            for step in 1...4 {
                let shift = (hue + CGFloat(step) * 0.11).truncatingRemainder(dividingBy: 1)
                UIColor(hue: shift, saturation: 0.4 + random() * 0.5, brightness: 0.35 + random() * 0.65, alpha: 0.9).setFill()
                let side = 120 + random() * 240
                let rect = CGRect(x: random() * 400 - side / 2, y: random() * 400 - side / 2, width: side, height: side)
                if step.isMultiple(of: 2) { context.fill(rect) } else { context.cgContext.fillEllipse(in: rect) }
            }
        }
    }

    @MainActor static func open(_ library: Library, router: Router) {
        switch name {
        case "library": router.tab = .library
        case "search", "addmusic": router.tab = .search
        case "playliststab": router.tab = .playlists
        case "settings": router.tab = .settings
        case "playlists", "artists", "albums", "songs", "downloaded":
            router.tab = .library
            let routes: [String: Route] = ["playlists": .playlists, "artists": .artists, "albums": .albums, "songs": .songs, "downloaded": .downloaded]
            router.library = [routes[name!]!]
        case "homesection": router.home = [.homeSection(.history)]
        case "folder":
            router.tab = .library
            router.library = [.playlists] + (library.shelf.folders.first { $0.coverVersion != nil }.map { [Route.folder($0.id)] } ?? [])
        case "album":
            if let album = library.albums.first { router.home = [.album(album)] }
        case "artist":
            if let artist = library.artists.first(where: { !library.albums(artist: $0.id).isEmpty }) { router.home = [.artist(artist)] }
        case "playlist":
            if let playlist = library.playlists.first { router.home = [.playlist(playlist)] }
        case "nowplaying", "queue", "history", "lyrics", "more", "devices": router.showingPlayer = true
        default: break
        }
    }
}
#endif
