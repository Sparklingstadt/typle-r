// swift-tools-version:5.9
import PackageDescription

// The rules Typle shares with the web app (src/core), with no UI. The iPad app depends on it; it also builds on
// macOS and Linux so `swift test` runs without a simulator.
let package = Package(
  name: "TypleCore",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.library(name: "TypleCore", targets: ["TypleCore"])],
  targets: [
    .target(name: "TypleCore", resources: [.copy("Resources/samples.json"), .copy("Resources/countries.json")]),
    .testTarget(name: "TypleCoreTests", dependencies: ["TypleCore"]),
  ]
)
