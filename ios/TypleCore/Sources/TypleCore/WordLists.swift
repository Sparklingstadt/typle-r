import Foundation

// src/core/wordLists.ts, src/core/listOverview.ts and the limits of src/core/workspaceRequest.ts

public let maxLists = 150
public let maxListName = 200
public let maxWords = 1000
public let maxWordField = 1000
public let maxAnnotation = 2000
public let maxRecords = 10000

public func validateList(_ list: WordList, others: [WordList] = []) throws {
  let name = list.name.trimmed
  if name.isEmpty { throw TypleError("listNameRequired") }
  if others.contains(where: { $0.name.trimmed.lowercased() == name.lowercased() }) { throw TypleError("listNameDuplicate") }
  if list.words.isEmpty { throw TypleError("wordsRequired") }
  if list.words.contains(where: { $0.display.trimmed.isEmpty || $0.input.trimmed.isEmpty }) { throw TypleError("wordFieldsRequired") }
}

/// The checks `decodeLists` makes on saved lists, plus the size limits of a save.
public func validateLists(_ lists: [WordList]) throws {
  var ids = Set<String>()
  for list in lists {
    let corrupted = list.id.isEmpty || ids.contains(list.id) || list.records.contains { record in
      !record.time.isFinite || record.time < 0 || parseDate(record.date) == nil ||
        (record.device.map { !isDevice($0) } ?? false) ||
        (record.accuracy.map { !$0.isFinite || $0 < 0 || $0 > 100 } ?? false) ||
        (record.mistakes.map { $0 < 0 } ?? false) ||
        (record.wordCount.map { $0 < 1 } ?? false)
    }
    if corrupted { throw TypleError("savedDataCorrupted") }
    try validateList(list)
    ids.insert(list.id)
  }
  if lists.contains(where: { list in
    list.words.count > maxWords || list.records.count > maxRecords || list.name.jsLength > maxListName ||
      list.words.contains { $0.input.jsLength > maxWordField || $0.display.jsLength > maxWordField || $0.annotation.jsLength > maxAnnotation }
  }) { throw TypleError("invalidWorkspace") }
}

/// Saves a new or edited list. Whitespace can be meaningful in typing strings and annotations, so only the name is
/// trimmed. The editor's copy of a list knows nothing of its records, so those stay as saved.
public func saveList(_ lists: [WordList], _ list: WordList, editing: Bool) throws -> [WordList] {
  if editing && !lists.contains(where: { $0.id == list.id }) { throw TypleError("listDeleted") }
  try validateList(list, others: lists.filter { $0.id != list.id })
  var normalized = list
  normalized.name = list.name.trimmed
  if lists.contains(where: { $0.id == list.id }) {
    return lists.map { item in
      guard item.id == list.id else { return item }
      var kept = normalized
      kept.records = item.records
      return kept
    }
  }
  if lists.count >= maxLists { throw TypleError("listLimit", ["max": String(maxLists)]) }
  return lists + [normalized]
}

public struct ListOverview: Identifiable, Hashable, Sendable {
  public var list: WordList
  /// Position in the saved order, which is the order the lists were added in.
  public var position: Int
  public var practiceCount: Int
  /// Milliseconds since 1970.
  public var lastPracticed: Double?
  public var id: String { list.id }
}

public enum ListOrder: String, CaseIterable, Sendable {
  case added, practiced, name, words
}

public func listOverviews(_ lists: [WordList]) -> [ListOverview] {
  lists.enumerated().map { position, list in
    let dates = list.records.compactMap { parseDate($0.date)?.timeIntervalSince1970 }.map { $0 * 1000 }
    return ListOverview(list: list, position: position, practiceCount: list.records.count, lastPracticed: dates.max())
  }
}

/// Newest first for `added`. Lists without a record come after the practised ones for `practiced`.
public func sortOverviews(_ items: [ListOverview], order: ListOrder, locale: Locale = .current) -> [ListOverview] {
  items.sorted { a, b in
    switch order {
    case .name:
      let result = a.list.name.compare(b.list.name, options: [.numeric], range: nil, locale: locale)
      return result != .orderedSame ? result == .orderedAscending : b.position < a.position
    case .words:
      return a.list.words.count != b.list.words.count ? a.list.words.count > b.list.words.count : b.position < a.position
    case .practiced:
      let x = a.lastPracticed ?? -.infinity, y = b.lastPracticed ?? -.infinity
      return x != y ? x > y : b.position < a.position
    case .added:
      return b.position < a.position
    }
  }
}

/// Matches the list name and the words, so a list can be found by one of its words.
public func matchesQuery(_ list: WordList, _ query: String) -> Bool {
  let needle = query.trimmed.lowercased()
  if needle.isEmpty { return true }
  return list.name.lowercased().contains(needle) ||
    list.words.contains { $0.display.lowercased().contains(needle) || $0.input.lowercased().contains(needle) }
}

/// The records a list's best is taken from: runs at its current word count.
public func currentRecordCount(_ list: WordList) -> Int {
  list.records.filter { $0.wordCount == list.words.count }.count
}

/// `suffix(n)` is the localized mark for the nth copy, such as （コピー） and （コピー2）.
public func copyName(_ lists: [WordList], _ name: String, suffix: (Int) -> String) -> String {
  let taken = Set(lists.map { $0.name.trimmed.lowercased() })
  var n = 1
  while true {
    let mark = suffix(n)
    let base = String(decoding: name.trimmed.utf16.prefix(max(0, maxListName - mark.jsLength)), as: UTF16.self)
    let candidate = base + mark
    if !taken.contains(candidate.lowercased()) { return candidate }
    n += 1
  }
}

/// A copy keeps the words but starts without records, so its best is its own.
public func duplicateList(_ lists: [WordList], id: String, copyId: String, suffix: (Int) -> String, now: Date = Date()) throws -> (lists: [WordList], copy: WordList) {
  guard let source = lists.first(where: { $0.id == id }) else { throw TypleError("listDeleted") }
  if lists.count >= maxLists { throw TypleError("listLimit", ["max": String(maxLists)]) }
  let copy = WordList(id: copyId, name: copyName(lists, source.name, suffix: suffix), words: source.words, createdAt: isoString(now))
  return (lists + [copy], copy)
}
