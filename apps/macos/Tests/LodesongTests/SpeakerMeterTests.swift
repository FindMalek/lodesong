import AppKit
import WebKit
import XCTest

/// The control for the harness's silence proof: the speaker meter must hear a tone from a page that is not muted, or a
/// flat zero from the muted harness would mean nothing. The tone is 0.0003 of full scale (-70 dB), inaudible.
@MainActor final class SpeakerMeterTests: XCTestCase {
    func testMeterHearsAnInaudibleToneFromAPageThatIsNotMuted() async throws {
        guard #available(macOS 14.2, *) else { throw XCTSkip("process taps need macOS 14.2") }
        guard hasDefaultOutputDevice() else {
            let message = "no audio output device on this machine"
            if ProcessInfo.processInfo.environment["CI"] != nil { return XCTFail(message) }
            throw XCTSkip(message)
        }
        _ = NSApplication.shared
        let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 400, height: 300), styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = web
        web.loadHTMLString("<html><body></body></html>", baseURL: URL(string: "http://127.0.0.1/"))
        try await Task.sleep(nanoseconds: 1_000_000_000)
        _ = try await web.callAsyncJavaScript(
            """
            const context = new AudioContext();
            const tone = context.createOscillator(), gain = context.createGain();
            gain.gain.value = 0.0003;
            tone.connect(gain).connect(context.destination);
            tone.start();
            await context.resume();
            """, arguments: [:], in: nil, contentWorld: .page)
        defer { window.orderOut(nil); web.loadHTMLString("", baseURL: nil) }
        try await Task.sleep(nanoseconds: 500_000_000)
        guard let pid = Silence.audioProcess(of: web), let peak = await SpeakerMeter.peak(ofProcess: pid, seconds: 1) else {
            throw XCTSkip("the speaker meter can't be made on this machine (no process tap): the silence proof is not run here")
        }
        XCTAssertGreaterThan(peak, 0.0001, "the meter did not hear a tone that reached the device: its zero proves nothing")
    }
}
