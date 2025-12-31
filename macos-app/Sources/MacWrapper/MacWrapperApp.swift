import SwiftUI

@main
struct MacWrapperApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup("Budget") {
            RootView()
                .environmentObject(appDelegate.backend)
        }
    }
}
