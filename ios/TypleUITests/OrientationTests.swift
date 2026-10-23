import XCTest

/// Turns the simulator for screenshots. The app supports Split View, so iPadOS
/// ignores its own orientation requests and `simctl` cannot rotate a device; the turned device stays turned after the
/// test, and the workflow then launches the app with `simctl`.
final class OrientationTests: XCTestCase {
  func testLandscape() {
    XCUIDevice.shared.orientation = .landscapeLeft
    XCTAssertEqual(XCUIDevice.shared.orientation, .landscapeLeft)
  }

  func testPortrait() {
    XCUIDevice.shared.orientation = .portrait
    XCTAssertEqual(XCUIDevice.shared.orientation, .portrait)
  }
}
