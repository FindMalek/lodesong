import SwiftUI
import UIKit
import WebKit

/// lodesong in a web view. The page already reports to `webkit.messageHandlers.keep` (what the Mac app listens to); here
/// that tells us when music plays (take the audio session) and when the hidden menu is asked for.
final class PlayerController: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    enum Phase: Equatable {
        case loading
        case ready
        case failed(String)
    }

    @Published var phase: Phase = .loading
    @Published var showMenu = false
    @Published var background = Color(UIColor.systemBackground)

    let webView: WKWebView
    private let server: URL

    init(server: URL) {
        self.server = server
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.allowsAirPlayForMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "lodesong-ios"
        let content = WKUserContentController()
        config.userContentController = content
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        content.add(WeakHandler(self), name: "keep")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.load(URLRequest(url: server))
    }

    func reload() {
        phase = .loading
        if webView.url == nil {
            webView.load(URLRequest(url: server))
        } else {
            webView.reload()
        }
    }

    /// The safe-area bands around the page take the page's own background, so a dark theme has no black frame.
    func syncBackground() {
        let script = """
        (() => {
          const read = (element) => getComputedStyle(element).backgroundColor;
          let css = read(document.body);
          if (css === 'rgba(0, 0, 0, 0)') css = read(document.documentElement);
          const context = document.createElement('canvas').getContext('2d');
          context.fillStyle = css;
          context.fillRect(0, 0, 1, 1);
          const data = context.getImageData(0, 0, 1, 1).data;
          return [data[0], data[1], data[2]];
        })()
        """
        webView.evaluateJavaScript(script) { [weak self] value, _ in
            guard let numbers = value as? [NSNumber], numbers.count == 3 else { return }
            let rgb = numbers.map { $0.doubleValue / 255 }
            DispatchQueue.main.async {
                self?.background = Color(red: rgb[0], green: rgb[1], blue: rgb[2])
            }
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if body["preview"] != nil {
            DispatchQueue.main.async { self.showMenu = true }
        } else if body["playing"] as? Bool == true {
            AudioSession.activate()
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        phase = .ready
        syncBackground()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.syncBackground() }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fail(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(error)
    }

    private func fail(_ error: Error) {
        let code = (error as NSError).code
        // A navigation replaced by another one is not a failure.
        if code == NSURLErrorCancelled { return }
        phase = .failed(error.localizedDescription)
    }

    /// Links to other sites open in the browser; the page's own stay in the app.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url, url.host != server.host {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    /// `target=_blank` and `window.open`: the browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }
}

/// WKUserContentController keeps its handlers strongly; this keeps the controller from never being freed.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
