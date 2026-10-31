import AVFoundation
import SwiftUI

/// What the app itself remembers: which lodesong to open, and the audio session that lets music play with the
/// silent switch on and keep going with the screen locked.
final class AppModel: ObservableObject {
    @Published var server: URL? {
        didSet { UserDefaults.standard.set(server, forKey: "server") }
    }

    init() {
        server = UserDefaults.standard.url(forKey: "server")
        AudioSession.prepare()
    }

    /// "music.example.com" becomes https; an address on your own network (an IP, a port, `.local`) stays http.
    static func normalize(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") {
            let local = text.hasSuffix(".local") || text.contains(":") || text.range(of: #"^\d{1,3}(\.\d{1,3}){3}"#, options: .regularExpression) != nil
            text = (local ? "http://" : "https://") + text
        }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), let host = url.host, !host.isEmpty, url.scheme == "http" || url.scheme == "https" else { return nil }
        return url
    }
}

enum AudioSession {
    /// The playback category is what makes the silent switch not matter; the session itself is only taken once music plays.
    static func prepare() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
    }

    static func activate() {
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}
