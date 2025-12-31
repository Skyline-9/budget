// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MacWrapper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "MacWrapper", targets: ["MacWrapper"])
    ],
    targets: [
        .executableTarget(
            name: "MacWrapper",
            linkerSettings: [
                .linkedFramework("SwiftUI"),
                .linkedFramework("AppKit"),
                .linkedFramework("WebKit")
            ]
        )
    ]
)
