import WebKit
import XCTest
@testable import Lodesong

// The macOS app's engine: a real WKWebView configured as PlayerView does, on the built player and the mock Navidrome.
// `swift test` needs `./dist/lodesong` (bun scripts/build.ts) and bun on the PATH.
@MainActor final class PlayerHarnessTests: XCTestCase {
    private static let audible = 0.04
    private var page: PlayerPage?

    override func setUp() async throws {
        trace("servers starting")
        try await Servers.start()
        await PlayerPage.resetStore()
        trace("servers up")
    }

    override func tearDown() async throws {
        page?.close()
        page = nil
    }

    override class func tearDown() {
        Servers.stop()
    }

    private func open(_ quality: String = "original") -> PlayerPage {
        let opened = PlayerPage(quality: quality)
        page = opened
        return opened
    }

    /// A context only reaches `running` with an output device, even when the page is muted. Without one the audio
    /// checks are skipped locally and fail in CI, where a silent skip would leave a green job that proved nothing.
    /// Checked first, so a machine with no device fails in seconds and not after every wait has run out.
    private func requireOutputDevice() throws {
        if hasDefaultOutputDevice() { return }
        let message = "no audio output device on this machine: the AudioContext never runs, so sound can't be measured"
        if ProcessInfo.processInfo.environment["CI"] != nil {
            XCTFail(message)
            throw HarnessError(message)
        }
        throw XCTSkip(message)
    }

    private func requireRunningContext(_ page: PlayerPage) async throws {
        try requireOutputDevice()
        let running = await page.until(20) { await page.states().contains("running") }
        if !running { XCTFail("an output device exists but the AudioContext is \(await page.states())") }
    }

    private func expectAudible(_ page: PlayerPage, _ what: String) async throws {
        try await requireRunningContext(page)
        let heard = await page.until(30) { await page.level() > Self.audible }
        let level = await page.level()
        XCTAssertTrue(heard, "\(what) is silent: output level \(level)")
        try await expectNothingReachesTheSpeakers(page)
    }

    /// The tone is audible to the analyser and not to the speakers: what the process hands the device stays at zero.
    /// `SpeakerMeterTests` shows the same meter hears a tone this quiet from a page that is not muted.
    private func expectNothingReachesTheSpeakers(_ page: PlayerPage) async throws {
        guard let peak = await page.speakerPeak() else {
            trace("speakers not metered: relying on the page mute, which `Silence.mute` read back")
            return
        }
        XCTAssertLessThan(peak, 1e-6, "the harness is audible: the page hands the audio device up to \(peak)")
    }

    /// Whether the page may render at the screen's rate: Safari's "Prefer Page Rendering Updates near 60fps" flag is off
    /// (nil: this WebKit has no such flag).
    private func fullFrameRate(_ preferences: WKPreferences) -> Bool? {
        let list = NSSelectorFromString("_features"), read = NSSelectorFromString("_isEnabledForFeature:")
        let type: AnyObject = WKPreferences.self
        guard type.responds(to: list), preferences.responds(to: read),
              let features = type.perform(list)?.takeUnretainedValue() as? [NSObject],
              let feature = features.first(where: {
                  $0.responds(to: NSSelectorFromString("key")) && $0.value(forKey: "key") as? String == "PreferPageRenderingUpdatesNear60FPSEnabled"
              })
        else { return nil }
        typealias Read = @convention(c) (AnyObject, Selector, AnyObject) -> Bool
        return !unsafeBitCast(preferences.method(for: read), to: Read.self)(preferences, read, feature)
    }

    func testCanPlayTypeMatrix() async throws {
        let page = open()
        try await page.playAlbum("al-3")
        let types = try await page.json(
            """
            (() => { const a = new Audio(); return {
              opus: a.canPlayType('audio/ogg; codecs="opus"'), mp3: a.canPlayType("audio/mpeg"),
              aac: a.canPlayType('audio/mp4; codecs="mp4a.40.2"'), flac: a.canPlayType("audio/flac"), wav: a.canPlayType("audio/wav") }; })()
            """)
        for format in ["mp3", "aac", "flac", "wav"] {
            XCTAssertNotEqual(types[format] as? String, "", "WebKit can't play \(format)")
        }
        XCTAssertNotEqual(types["opus"] as? String, "", "WebKit can't play ogg opus: the player would send auto quality opus to a silent engine")
    }

    func testEngineIsConfiguredAsTheAppIsRun() async throws {
        let page = open()
        let configuration = page.web.configuration
        XCTAssertTrue(configuration.mediaTypesRequiringUserActionForPlayback.isEmpty, "the app lets media play without a tap")
        XCTAssertTrue(configuration.websiteDataStore === WKWebsiteDataStore.default(), "the app uses the default store")
        XCTAssertTrue(configuration.websiteDataStore.isPersistent, "the app keeps its sign-in and settings between launches")
        XCTAssertNotEqual(fullFrameRate(configuration.preferences), false, "the app asks WebKit for the screen's refresh rate, not 60 fps")
        try await page.playAlbum("al-3")
        let agent = try await page.js("return navigator.userAgent") as? String
        XCTAssertTrue(agent?.contains("lodesong-desktop") == true, "the player names this device by the user agent: \(agent ?? "")")
    }

    /// The island, menu bar and media keys: the app calls `window.keepNative` with no DOM tap behind it. WebKit treats
    /// that script as user-activated, which the test pins so it can't be read as an activation-free start.
    func testAudibleWhenStartedByTheNativeBridgeWithNoDomTap() async throws {
        try requireOutputDevice()
        let page = open()
        try await page.playAlbum("al-3")
        let playing = await page.until { page.nowPlaying.playing }
        let seen = playing ? "" : await page.describe()
        XCTAssertTrue(playing, "play from the page did not reach the native side: \(seen)")
        try await expectAudible(page, "original")
        page.player.call("toggle()")
        let paused = await page.until { !page.nowPlaying.playing }
        XCTAssertTrue(paused, "toggle() did not pause")
        let before = await page.activations().count
        page.player.call("play()")
        let again = await page.until { page.nowPlaying.playing }
        XCTAssertTrue(again, "keepNative.play() did not resume")
        try await expectAudible(page, "keepNative.play()")
        let calls = await page.activations().dropFirst(before)
        XCTAssertFalse(calls.isEmpty, "keepNative.play() never called the media element")
        XCTAssertTrue(
            calls.allSatisfy { $0.active == true },
            "the native bridge no longer counts as user-activated: \(calls). Then it is activation-free and this test covers the other one")
    }

    /// The real activation-free start: the page reloaded on its saved queue, where a page timer presses play with no
    /// event and no script from the app, so `navigator.userActivation` is false. Only the app's media policy lets that play.
    func testAudibleWhenStartedWithNoUserActivationAtAll() async throws {
        try requireOutputDevice()
        let page = open()
        try await page.playAlbum("al-3")
        let playing = await page.until { page.nowPlaying.playing }
        let state = playing ? "" : await page.describe()
        XCTAssertTrue(playing, "play from the page did not reach the native side: \(state)")
        page.player.call("toggle()")
        let paused = await page.until { !page.nowPlaying.playing }
        XCTAssertTrue(paused, "toggle() did not pause")
        let saved = await page.until { await page.savedQueue() }
        XCTAssertTrue(saved, "the page never saved its queue, so a reload has no song to start")
        // A reload sometimes comes up with an empty queue on a loaded machine (the player's restore races its account
        // check), so it is tried again: it is the setup that is flaky, not the start this test is about.
        var pressed = false
        for attempt in 1...3 where !pressed {
            if attempt == 1 { page.reloadStartingByItself() } else { page.web.reload() }
            pressed = await page.until(25) { (try? await page.js("return window.__autostart !== undefined")) as? Bool == true }
            if !pressed { trace("attempt \(attempt): the reloaded page showed no song to start: \(await page.describe())") }
        }
        XCTAssertTrue(pressed, "three reloads never showed a song to start")
        let seen = try await page.json("window.__autostart ?? {}")
        XCTAssertEqual(seen["active"] as? Bool, false, "something activated the page right before play: \(seen)")
        let resumed = await page.until { page.nowPlaying.playing }
        XCTAssertTrue(resumed, "play with no user activation was refused: the media policy blocks it")
        try await expectAudible(page, "a start with no user activation")
    }

    func testOriginalMp3AndOpusAreAudible() async throws {
        try requireOutputDevice()
        for quality in ["original", "mp3-320", "opus-192"] {
            let page = open(quality)
            try await page.playAlbum("al-3")
            try await expectAudible(page, quality)
            page.close()
        }
    }

    /// WebKit plays a stream with no length and hands Web Audio silence: the player downloads it whole instead.
    func testAnOpusStreamWithNoContentLengthIsAudible() async throws {
        try requireOutputDevice()
        await Servers.unsize("so-35")
        let page = open("opus-192")
        try await page.playAlbum("al-3")
        try await expectAudible(page, "an opus stream with no Content-Length")
        await Servers.unsize("so-35", on: false)
    }

    func testAudioDiagnosticsAnswerThroughTheBridgeWithoutSecrets() async throws {
        let page = open("opus-192")
        try await page.playAlbum("al-3")
        try await expectAudible(page, "opus-192")
        let text = await page.player.audioDiagnostics()
        let report = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any], "not JSON: \(text.prefix(300))")
        let app = try XCTUnwrap(report["app"] as? [String: Any])
        XCTAssertNotNil(app["webKit"])
        XCTAssertNotNil(app["output"])
        XCTAssertEqual(try XCTUnwrap(report["stream"] as? [String: Any])["playing"] as? String, "opus-192")
        XCTAssertEqual((report["context"] as? [String: Any])?["state"] as? String, "running")
        let decks = try XCTUnwrap(report["decks"] as? [[String: Any]])
        let active = try XCTUnwrap(decks.first { $0["active"] as? Bool == true })
        XCTAssertTrue((active["src"] as? String)?.hasPrefix("/rest/stream?id=") == true, "the stream is named without its origin: \(active["src"] ?? "nil")")
        XCTAssertGreaterThan(report["graphPeak"] as? Double ?? 0, Self.audible, "the report says nothing leaves the graph while the tap hears it")
        XCTAssertNotNil((report["probe"] as? [String: Any])?["status"], "the range probe answered nothing")
        XCTAssertEqual(report["findings"] as? [String], [], "a healthy playback has findings")
        XCTAssertFalse(text.contains(Servers.app.host ?? "127.0.0.1"), "the report names the server")
        XCTAssertFalse(text.lowercased().contains("cookie"), "the report mentions cookies")
    }

    func testAPageThatDoesNotAnswerStillGivesAReport() {
        let report = Diagnostics.report(page: nil, app: ["version": "1.2.3"])
        XCTAssertTrue(report.contains("\"version\" : \"1.2.3\""))
        XCTAssertTrue(report.contains("did not answer"))
    }

    func testNativeCommandsReachThePage() async throws {
        let page = open()
        try await page.playAlbum("al-3")
        let playing = await page.until { page.nowPlaying.playing }
        XCTAssertTrue(playing, "play from the page did not reach the native side")
        let first = page.nowPlaying.id
        XCTAssertNotNil(first, "no song is playing")

        page.player.call("toggle()")
        let paused = await page.until { !page.nowPlaying.playing }
        XCTAssertTrue(paused, "toggle() did not pause")
        page.player.call("toggle()")
        let resumed = await page.until { page.nowPlaying.playing }
        XCTAssertTrue(resumed, "toggle() did not resume")

        page.player.call("seek(4)")
        let sought = await page.until { await page.playhead() >= 3.5 }
        let playhead = await page.playhead()
        XCTAssertTrue(sought, "seek(4) left the playhead at \(playhead)")

        page.player.call("next()")
        let moved = await page.until { page.nowPlaying.id != first }
        XCTAssertTrue(moved, "next() did not change the song")
    }
}
