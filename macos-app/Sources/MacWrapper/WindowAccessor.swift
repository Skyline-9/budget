import SwiftUI
import AppKit

/// Lets us access and tweak the underlying NSWindow from SwiftUI.
struct WindowAccessor: NSViewRepresentable {
    let onResolve: (NSWindow) -> Void

    final class Coordinator {
        var didResolve = false
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSView {
        NSView(frame: .zero)
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        guard !context.coordinator.didResolve else { return }
        guard let window = nsView.window else { return }

        context.coordinator.didResolve = true
        DispatchQueue.main.async {
            onResolve(window)
        }
    }
}
