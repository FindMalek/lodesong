import AppKit
import WebKit
import XCTest
@testable import Lodesong

/// The real `PlayerView` (same configuration, same native bridge) on the built player, with the shared output tap
/// injected and its audio muted at the page (`Silence`), so the test tone never reaches the speakers.
@MainActor final class PlayerPage {
    let player: PlayerView
    let nowPlaying = NowPlaying()
    var web: WKWebView { player.webView }

    private static let tap: String = {
        let file = Servers.root.appendingPathComponent("test/output-tap.js")
        do { return try String(contentsOf: file, encoding: .utf8) } catch { fatalError("cannot read \(file.path): \(error)") }
    }()

    /// Presses play from a page timer once the bar shows a song: no event and no script from the app. Records
    /// `navigator.userActivation` as it does, in `window.__autostart`.
    private static let autostart = """
    window.addEventListener("load", () => {
      const timer = setInterval(() => {
        const bar = [...document.querySelectorAll("footer button")].some((b) => b.getAttribute("aria-label") === "play");
        if (!window.keepNative || !bar) return;
        clearInterval(timer);
        const activation = navigator.userActivation;
        window.__autostart = { active: activation?.isActive ?? null, been: activation?.hasBeenActive ?? null };
        window.keepNative.play();
      }, 250);
    });
    """

    /// Wipes the app's persistent web data, so no run starts signed in or with settings an earlier one left.
    static func resetStore() async {
        await WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
    }

    init(quality: String, startsByItself: Bool = false) {
        let configuration = PlayerView.makeConfiguration()
        let seed = """
        window.__tap = { sink: "real" };
        \(Self.tap)
        window.__activation = [];
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          const activation = navigator.userActivation;
          window.__activation.push({ active: activation?.isActive ?? null, been: activation?.hasBeenActive ?? null });
          return play.call(this);
        };
        try {
          const key = "keep-player:settings";
          const settings = JSON.parse(localStorage.getItem(key) ?? "{}");
          localStorage.setItem(key, JSON.stringify({ queueSync: false, ...settings, streamQuality: "\(quality)" }));
          if (localStorage.getItem("keep-player:onboarded") === null) localStorage.setItem("keep-player:onboarded", "test");
        } catch {}
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: seed, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if startsByItself {
            configuration.userContentController.addUserScript(
                WKUserScript(source: Self.autostart, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        player = PlayerView(server: Servers.app, nowPlaying: nowPlaying, configuration: configuration)
        Silence.mute(player.webView)
        // A view outside any window is treated as hidden: WebKit throttles its timers and pages never settle.
        _ = NSApplication.shared
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800), styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = web
        window.orderFrontRegardless()
    }

    private let window: NSWindow

    /// What `navigator.userActivation` said at each `play()` call of the page (nil: the engine has no such API).
    func activations() async -> [(active: Bool?, been: Bool?)] {
        let list = (try? await js("return window.__activation") as? [[String: Any]]) ?? []
        return list.map { ($0["active"] as? Bool, $0["been"] as? Bool) }
    }

    func close() {
        web.loadHTMLString("", baseURL: nil)
        window.orderOut(nil)
    }

    @discardableResult
    func js(_ body: String, timeout: Double = 60) async throws -> Any? {
        let web = self.web
        return try await withThrowingTaskGroup(of: Any?.self) { group in
            group.addTask { @MainActor in try await web.callAsyncJavaScript(body, arguments: [:], in: nil, contentWorld: .page) }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw HarnessError("page script did not finish in \(timeout) s")
            }
            defer { group.cancelAll() }
            return try await group.next() ?? nil
        }
    }

    func json(_ expression: String) async throws -> [String: Any] {
        let text = try await js("return JSON.stringify(\(expression))") as? String ?? "{}"
        return (try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]) ?? [:]
    }

    func number(_ expression: String) async -> Double {
        (try? await js("return Number(\(expression))") as? Double) ?? 0
    }

    func states() async -> [String] {
        (try? await js("return window.__output.states()") as? [String]) ?? []
    }

    /// The loudest sample this page hands the audio device; nil when it can't be metered (see `SpeakerMeter`).
    func speakerPeak(_ seconds: Double = 1) async -> Float? {
        guard #available(macOS 14.2, *), let pid = Silence.audioProcess(of: web) else { return nil }
        return await SpeakerMeter.peak(ofProcess: pid, seconds: seconds)
    }

    func level() async -> Double { await number("window.__output.level()") }

    func playhead() async -> Double { await number("window.__output.playhead()") }

    /// True once `check` holds; false after `seconds`. Generous by default: the machine and CI are loaded.
    func until(_ seconds: Double = 30, _ check: () async -> Bool) async -> Bool {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if await check() { return true }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        return await check()
    }

    /// Signs in as the mock's user (if the app's store has no session yet) and presses play on an album from script
    /// the app runs: no DOM tap, as with the island or a media key. WebKit counts that script as user-activated, so it
    /// is not an activation-free start (`startsByItself: true` is).
    func playAlbum(_ id: String) async throws {
        trace("playAlbum: waiting for load")
        let loaded = await until { (try? await self.js("return !!document.querySelector('#root') && document.readyState === 'complete'")) as? Bool == true }
        trace("playAlbum: loaded=\(loaded)")
        XCTAssertTrue(loaded, "the player did not load")
        defer { trace("playAlbum: script done") }
        try await js(
            """
            const wait = (ms) => new Promise((r) => setTimeout(r, ms));
            const field = (label) => document.querySelector(`input[aria-label="${label}"], #${label}`) ?? [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === label)?.control;
            const fill = (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); };
            const signedIn = () => document.querySelector('a[href="/albums"]');
            for (let i = 0; i < 100 && !field("username") && !signedIn(); i++) await wait(100);
            if (field("username")) {
              fill(field("username"), "demo"); fill(field("password"), "demo");
              [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "sign in")?.click();
              for (let i = 0; i < 150 && !signedIn(); i++) await wait(100);
            }
            history.pushState({}, "", "/album/\(id)"); dispatchEvent(new Event("keep:navigate"));
            const play = () => [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === "play");
            for (let i = 0; i < 150 && !play(); i++) await wait(100);
            play()?.click();
            """)
    }
}
