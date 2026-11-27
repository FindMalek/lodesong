// swift-tools-version: 5.9
// Only here so `swift test` runs the core on a Mac. The app itself is built from project.yml.
import PackageDescription

let package = Package(
    name: "LodesongCore",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "LodesongCore", path: "Sources/Core"),
        .testTarget(name: "CoreTests", dependencies: ["LodesongCore"], path: "Tests/CoreTests"),
    ]
)
