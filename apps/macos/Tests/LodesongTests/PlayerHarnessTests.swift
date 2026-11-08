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

    /// A context only reaches `running` with an output device; without one the audio checks are skipped, loudly.
    private func requireRunningContext(_ page: PlayerPage) async throws {
        let running = await page.until(20) { await page.states().contains("running") }
        if running { return }
        let states = await page.states()
        if !hasDefaultOutputDevice() {
            throw XCTSkip("no audio output device on this machine: the AudioContext stays \(states), so sound can't be measured")
        }
        XCTFail("an output device exists but the AudioContext is \(states)")
    }

    private func expectAudible(_ page: PlayerPage, _ what: String) async throws {
        try await requireRunningContext(page)
        let heard = await page.until(30) { await page.level() > Self.audible }
        let level = await page.level()
        XCTAssertTrue(heard, "\(what) is silent: output level \(level)")
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
        XCTAssertTrue(page.web.configuration.mediaTypesRequiringUserActionForPlayback.isEmpty, "the app lets media play without a tap")
        try await page.playAlbum("al-3")
        let agent = try await page.js("return navigator.userAgent") as? String
        XCTAssertTrue(agent?.contains("lodesong-desktop") == true, "the player names this device by the user agent: \(agent ?? "")")
    }

    func testAudibleWhenStartedWithoutATap() async throws {
        let page = open()
        try await page.playAlbum("al-3")
        let playing = await page.until { page.nowPlaying.playing }
        XCTAssertTrue(playing, "play from the page did not reach the native side")
        try await expectAudible(page, "original")
        page.player.call("toggle()")
        let paused = await page.until { !page.nowPlaying.playing }
        XCTAssertTrue(paused)
        page.player.call("play()")
        let again = await page.until { page.nowPlaying.playing }
        XCTAssertTrue(again, "keepNative.play() did not resume")
        try await expectAudible(page, "keepNative.play()")
    }

    func testOriginalMp3AndOpusAreAudible() async throws {
        for quality in ["original", "mp3-320", "opus-192"] {
            let page = open(quality)
            try await page.playAlbum("al-3")
            try await expectAudible(page, quality)
            page.close()
        }
    }

    func testNativeCommandsReachThePage() async throws {
        let page = open()
        try await page.playAlbum("al-3")
        let playing = await page.until { page.nowPlaying.playing }
        XCTAssertTrue(playing)
        let first = page.nowPlaying.id
        XCTAssertNotNil(first)

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
