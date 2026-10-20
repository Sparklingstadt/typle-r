import Foundation

// src/core/records.ts

public func makeRecord(_ session: TypingSession, wordCount: Int, id: String, device: PracticeDevice?) throws -> StoredRecord {
  guard let finishedAt = session.finishedAt, session.startedAt != nil else { throw TypleError("practiceIncomplete") }
  let result = sessionResult(session)
  return StoredRecord(id: id, time: result.time, date: isoString(Date(timeIntervalSince1970: finishedAt / 1000)),
                      mistakes: result.mistakes, accuracy: result.accuracy, device: device, wordCount: wordCount)
}

/// Adds a record once: sending the same record id again leaves the list as it is.
public func addRecord(_ lists: [WordList], listId: String, record: StoredRecord) throws -> [WordList] {
  guard lists.contains(where: { $0.id == listId }) else { throw TypleError("recordListDeleted") }
  return lists.map { list in
    guard list.id == listId, !list.records.contains(where: { $0.id != nil && $0.id == record.id }) else { return list }
    var list = list
    list.records.append(record)
    return list
  }
}

public enum RankOrder: String, CaseIterable, Sendable {
  /// The higher accuracy wins and time breaks ties (records without accuracy come last).
  case accuracy
  /// The reverse.
  case speed
}

public func rankRecords(_ records: [StoredRecord], order: RankOrder = .accuracy) -> [StoredRecord] {
  rankIndices(records, order: order).map { records[$0] }
}

func rankIndices(_ records: [StoredRecord], order: RankOrder = .accuracy) -> [Int] {
  records.indices.stableSorted { a, b in
    let (x, y) = (records[a], records[b])
    let accuracyX = x.accuracy ?? -1, accuracyY = y.accuracy ?? -1
    switch order {
    case .accuracy: return accuracyX != accuracyY ? accuracyX > accuracyY : x.time < y.time
    case .speed: return x.time != y.time ? x.time < y.time : accuracyX > accuracyY
    }
  }
}

public func bestRecords(_ records: [StoredRecord], limit: Int = 5, order: RankOrder = .accuracy) -> [StoredRecord] {
  Array(rankRecords(records, order: order).prefix(limit))
}

/// Editing a list changes the task, so only runs at its current word count are compared. Records without a word
/// count predate that field and cannot be matched. With no matching run, every record is compared instead.
public func comparableRecords(_ list: WordList, _ records: [StoredRecord]? = nil) -> [StoredRecord] {
  let records = records ?? list.records
  let same = records.filter { $0.wordCount == list.words.count }
  return same.isEmpty ? records : same
}

/// The record every screen shows as a list's best.
public func listBest(_ list: WordList) -> StoredRecord? {
  bestRecords(comparableRecords(list), limit: 1).first
}

/// The position of the list's best in `list.records`.
func listBestIndex(_ list: WordList) -> Int? {
  let same = list.records.indices.filter { list.records[$0].wordCount == list.words.count }
  let candidates = same.isEmpty ? Array(list.records.indices) : same
  return rankIndices(candidates.map { list.records[$0] }).first.map { candidates[$0] }
}

/// Removes a record by id, or by date and time for records from before ids.
public func removeRecord(_ lists: [WordList], listId: String, record: StoredRecord) -> [WordList] {
  lists.map { list in
    guard list.id == listId else { return list }
    var list = list
    list.records.removeAll { item in
      if let id = record.id { return item.id == id }
      return item.date == record.date && item.time == record.time
    }
    return list
  }
}

public struct RecordRow: Identifiable, Hashable, Sendable {
  public var list: WordList
  public var record: StoredRecord
  public var index: Int
  public var id: String
  /// Whether this record currently ranks first in its list.
  public var best: Bool
}

/// Every record with its list, newest first.
public func recordRows(_ lists: [WordList]) -> [RecordRow] {
  lists.flatMap { list -> [RecordRow] in
    let best = listBestIndex(list)
    return list.records.enumerated().map { index, record in
      RecordRow(list: list, record: record, index: index, id: "\(list.id)-\(record.id ?? "\(index)-\(record.date)")", best: index == best)
    }
  }.stableSorted { timeOf($0.record.date) > timeOf($1.record.date) }
}

/// The filter value for records without a device.
public let noDevice = "none"

public func matchesDevice(_ record: StoredRecord, _ device: String?) -> Bool {
  guard let device else { return true }
  return device == noDevice ? record.device == nil : record.device?.id == device
}

public func filterRows(_ rows: [RecordRow], list: String?, device: String?) -> [RecordRow] {
  rows.filter { (list == nil || $0.list.id == list) && matchesDevice($0.record, device) }
}

public struct DeviceOption: Hashable, Sendable {
  public var value: String
  public var device: PracticeDevice?
  public var count: Int
}

/// Devices come from the records themselves, so deleted or renamed devices can still be picked (by id, with the
/// newest name). Records without a device are grouped last.
public func deviceOptions(_ records: [StoredRecord]) -> [DeviceOption] {
  var options: [DeviceOption] = []
  for record in records.stableSorted(by: { timeOf($0.date) > timeOf($1.date) }) {
    let value = record.device?.id ?? noDevice
    if let index = options.firstIndex(where: { $0.value == value }) { options[index].count += 1 }
    else { options.append(DeviceOption(value: value, device: record.device, count: 1)) }
  }
  return options.stableSorted { a, b in
    let noneA = a.value == noDevice, noneB = b.value == noDevice
    return noneA != noneB ? noneB : a.count > b.count
  }
}

public struct RecordDay: Hashable, Sendable {
  public var day: Date
  public var rows: [RecordRow]
  public var seconds: Double
}

/// Days follow the viewer's local calendar.
public func groupByDay(_ rows: [RecordRow], calendar: Calendar = .current) -> [RecordDay] {
  var groups: [RecordDay] = []
  for row in rows {
    let day = calendar.startOfDay(for: parseDate(row.record.date) ?? Date(timeIntervalSince1970: 0))
    if let last = groups.last, last.day == day {
      groups[groups.count - 1].rows.append(row)
      groups[groups.count - 1].seconds += row.record.time
    } else {
      groups.append(RecordDay(day: day, rows: [row], seconds: row.record.time))
    }
  }
  return groups
}

public enum TimeUnit: Sendable {
  case hours, minutes, seconds
}

/// Seconds keep two decimals so close runs stay distinguishable; a minute or more is split into minutes and seconds.
public func recordTimeParts(_ seconds: Double) -> [(String, TimeUnit)] {
  // Round first so 59.999 becomes 1 min 00.00 s rather than 60.00 s.
  let hundredths = Int((seconds * 100).rounded())
  if hundredths < 6000 { return [(String(format: "%.2f", Double(hundredths) / 100), .seconds)] }
  return [(String(hundredths / 6000), .minutes), (String(format: "%05.2f", Double(hundredths % 6000) / 100), .seconds)]
}

public func secondsPerWord(_ record: StoredRecord) -> Double? {
  guard let wordCount = record.wordCount, wordCount > 0 else { return nil }
  return record.time / Double(wordCount)
}

public func formatAccuracy(_ accuracy: Double?) -> String {
  guard let accuracy else { return "—" }
  let rounded = (accuracy * 10).rounded() / 10
  return rounded == rounded.rounded() ? "\(Int(rounded))%" : "\(rounded)%"
}
