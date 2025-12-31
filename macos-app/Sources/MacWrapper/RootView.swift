import SwiftUI

struct RootView: View {
    @EnvironmentObject var backend: BackendManager

    private var webURL: URL {
        backend.isReady ? backend.webURL : URL(string: "about:blank")!
    }

    var body: some View {
        ZStack {
            WebView(url: webURL)
                .ignoresSafeArea(.container, edges: [.leading, .trailing, .bottom])

            if let error = backend.lastError {
                VStack(spacing: 12) {
                    Text("Failed to start backend")
                        .font(.title3)

                    Text(error)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 520)

                    HStack(spacing: 12) {
                        Button("Retry") {
                            backend.start()
                        }

                        Button("Quit") {
                            NSApplication.shared.terminate(nil)
                        }
                    }
                }
                .padding(24)
            }
        }
        .background(Color(red: 0.067, green: 0.067, blue: 0.075)) // Matches webapp dark background (HSL 240 7% 7%)
        .background(
            WindowAccessor { window in
                // Use the standard macOS titlebar (no hidden/transparent titlebar).
                window.titleVisibility = .visible
                window.titlebarAppearsTransparent = false

                // Match webapp dark background for seamless blending
                // HSL 240 7% 7% ≈ RGB(17, 17, 19) ≈ NSColor(red: 0.067, green: 0.067, blue: 0.075)
                window.backgroundColor = NSColor(red: 0.067, green: 0.067, blue: 0.075, alpha: 1.0)
                window.isOpaque = true
            }
        )
    }
}
