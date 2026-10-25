import Foundation

/// What the iPad app names itself by. The Mac app, which began as these sources, is Sparklingstadt/typle-m.
enum Platform {
  /// The signin's `client` for the app's own login (docs/api.md).
  static let loginClient = "ipad"
  /// Names the data in this iPad's file, like `typle-r:device:<accountId>` in the web app.
  static let localAccountId = "ipad:local"
  static let resumeIcon = "hand.tap"
  static let demoDeviceName = "iPad＋Magic Keyboard"
}
