import SwiftUI
import WebKit
import AppKit

struct WebView: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        #if DEBUG
        // Enables Safari-like Web Inspector for WKWebView in Debug.
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        #endif

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator

        // Transparent background so the NSWindow background shows through.
        webView.setValue(false, forKey: "drawsBackground")

        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            webView.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

            guard let targetURL = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            // Keep navigation inside localhost; open external links in default browser
            if let host = targetURL.host,
               host != "127.0.0.1",
               host != "localhost" {

                NSWorkspace.shared.open(targetURL)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }
    }
}
