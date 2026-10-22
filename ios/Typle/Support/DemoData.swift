#if DEBUG
import Foundation
import TypleCore

/// Sample data for screenshots: `-TypleDemo YES` starts with the starting lists, a device and two weeks of records in
/// a temporary folder, so CI can show every page with content without touching real data.
enum DemoData {
  @MainActor
  static func store(defaults: UserDefaults) -> LocalWorkspaceStore? {
    guard defaults.bool(forKey: "TypleDemo") else { return nil }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("typle-demo", isDirectory: true)
    try? FileManager.default.removeItem(at: directory)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let file = WorkspaceFile(accountId: Platform.localAccountId, revision: 1, document: document())
    if let data = try? encodeWorkspaceFile(file) { try? data.write(to: directory.appendingPathComponent("workspace.json")) }
    return LocalWorkspaceStore(directory: directory)
  }

  static func document(now: Date = Date()) -> WorkspaceDocument {
    var lists = initialLists()
    let device = PracticeDevice(id: "demo-device", name: Platform.demoDeviceName, layout: "JIS")
    func date(daysAgo: Int, hour: Int) -> String {
      let day = Calendar.current.date(byAdding: .day, value: -daysAgo, to: Calendar.current.startOfDay(for: now))!
      return isoString(day.addingTimeInterval(Double(hour) * 3600))
    }
    let runs: [(Int, Int, Double, Int, Double)] = [(9, 20, 2.41, 2, 83.33), (6, 21, 1.92, 1, 90.91), (3, 19, 1.35, 0, 100),
                                                   (1, 22, 1.08, 1, 90.91), (0, 9, 0.98, 0, 100)]
    for (offset, (days, hour, time, mistakes, accuracy)) in runs.enumerated() {
      lists[0].records.append(StoredRecord(id: "demo-\(offset)", time: time, date: date(daysAgo: days, hour: hour), mistakes: mistakes,
                                           accuracy: accuracy, device: offset.isMultiple(of: 2) ? device : PracticeDevice(id: defaultDeviceId, name: "デフォルト"),
                                           wordCount: lists[0].words.count))
    }
    if lists.count > 2 {
      lists[2].records.append(StoredRecord(id: "demo-countries", time: 212.4, date: date(daysAgo: 5, hour: 20), mistakes: 14,
                                           accuracy: 88.2, device: device, wordCount: lists[2].words.count))
    }
    return WorkspaceDocument(lists: lists, devices: [device])
  }
}
#endif
