import Foundation
import WebKit
import XCTest
@testable import Lodesong

/// A SOCKS5 proxy that sends every host to one local port, so a name that resolves nowhere can only load through it.
private let socksScript = """
import socket, struct, sys, threading
target, listen = int(sys.argv[1]), int(sys.argv[2])
def pipe(a, b):
    try:
        while (d := a.recv(65536)): b.sendall(d)
    except OSError: pass
    for s in (a, b):
        try: s.shutdown(socket.SHUT_RDWR)
        except OSError: pass
def handle(c):
    c.recv(262); c.sendall(b"\\x05\\x00")
    h = c.recv(4); n = c.recv(1)[0] if h[3] == 3 else 0
    c.recv(n if h[3] == 3 else (4 if h[3] == 1 else 16)); c.recv(2)
    u = socket.create_connection(("127.0.0.1", target))
    c.sendall(b"\\x05\\x00\\x00\\x01\\x00\\x00\\x00\\x00\\x00\\x00")
    threading.Thread(target=pipe, args=(c, u), daemon=True).start(); pipe(u, c)
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", listen)); s.listen(8); print("ready", flush=True)
while True: threading.Thread(target=handle, args=(s.accept()[0],), daemon=True).start()
"""

@MainActor final class LocalProxyTests: XCTestCase {
    func testNothingListeningMeansNoProxy() {
        XCTAssertNil(LocalProxy.configuration(host: "music.example.com", port: 1))
    }

    func testAHostThatResolvesNowhereLoadsThroughTheProxy() async throws {
        let page = Process()
        page.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        page.arguments = ["-I", "-m", "http.server", "18741", "--bind", "127.0.0.1", "--directory", NSTemporaryDirectory()]
        try "<title>reached</title>".write(toFile: NSTemporaryDirectory() + "index.html", atomically: true, encoding: .utf8)
        let proxy = Process()
        proxy.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        proxy.arguments = ["-I", "-c", socksScript, "18741", "18742"]
        let ready = Pipe()
        proxy.standardOutput = ready
        try page.run(); try proxy.run()
        defer { page.terminate(); proxy.terminate() }
        _ = ready.fileHandleForReading.availableData

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let host = "hairpin.lodesong-test.invalid"
        let socks = try XCTUnwrap(LocalProxy.configuration(host: host, port: 18742))
        XCTAssertEqual(socks.matchDomains, [host])
        config.websiteDataStore.proxyConfigurations = [socks]
        let view = WKWebView(frame: .zero, configuration: config)
        view.load(URLRequest(url: URL(string: "http://\(host):18741/")!))
        var title: String?
        for _ in 0..<50 where title != "reached" {
            try await Task.sleep(nanoseconds: 100_000_000)
            title = try await view.evaluateJavaScript("document.title") as? String
        }
        XCTAssertEqual(title, "reached")
    }
}
