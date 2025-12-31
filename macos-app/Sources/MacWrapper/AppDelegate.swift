import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let backend = BackendManager()

    func applicationDidFinishLaunching(_ notification: Notification) {
        backend.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        backend.stop()
    }
}
