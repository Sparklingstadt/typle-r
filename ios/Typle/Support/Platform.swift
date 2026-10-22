import Foundation

/// What differs between the iPad app and the Mac app (macos/), which is built from the same sources.
enum Platform {
  #if os(macOS)
  /// The signin's `client` for the app's own login (docs/api.md).
  static let loginClient = "macos"
  /// Names the data in this Mac's file, like `typle-r:device:<accountId>` in the web app.
  static let localAccountId = "mac:local"
  static let resumeIcon = "cursorarrow.click"
  static let demoDeviceName = "MacBook Air（JIS）"
  #else
  static let loginClient = "ipad"
  static let localAccountId = "ipad:local"
  static let resumeIcon = "hand.tap"
  static let demoDeviceName = "iPad＋Magic Keyboard"
  #endif
}
