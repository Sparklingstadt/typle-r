import Foundation

/// An error that names a message under `errors` instead of carrying text, so the app shows it in the reader's
/// language (as AppError does in src/core/appError.ts). `values` fill `{name}` placeholders in the message.
public struct TypleError: Error, Equatable, Sendable {
  public let key: String
  public let values: [String: String]

  public init(_ key: String, _ values: [String: String] = [:]) {
    self.key = key
    self.values = values
  }
}

public struct Word: Codable, Hashable, Sendable {
  public var display: String
  public var input: String
  public var annotation: String

  public init(display: String, input: String, annotation: String = "") {
    self.display = display
    self.input = input
    self.annotation = annotation
  }
}

public struct PracticeDevice: Codable, Hashable, Identifiable, Sendable {
  public var id: String
  public var name: String
  public var layout: String

  public init(id: String, name: String, layout: String = "") {
    self.id = id
    self.name = name
    self.layout = layout
  }
}

/// A practice record as stored. Records from older versions may lack every field but `time` and `date`.
public struct StoredRecord: Codable, Hashable, Sendable {
  public var id: String?
  public var time: Double
  public var date: String
  public var mistakes: Int?
  public var accuracy: Double?
  public var device: PracticeDevice?
  public var wordCount: Int?

  public init(id: String? = nil, time: Double, date: String, mistakes: Int? = nil, accuracy: Double? = nil,
              device: PracticeDevice? = nil, wordCount: Int? = nil) {
    self.id = id
    self.time = time
    self.date = date
    self.mistakes = mistakes
    self.accuracy = accuracy
    self.device = device
    self.wordCount = wordCount
  }
}

public struct WordList: Codable, Hashable, Identifiable, Sendable {
  public var id: String
  public var name: String
  /// A broad grouping, such as プログラミング, and what the list is about, such as Kotlin (v0.78.0). Both are left out
  /// of the stored list when it has none, as the web app saves them.
  public var category: String?
  public var tags: [String]?
  public var words: [Word]
  public var records: [StoredRecord]
  public var createdAt: String

  public init(id: String, name: String, words: [Word], records: [StoredRecord] = [], createdAt: String,
              category: String? = nil, tags: [String]? = nil) {
    self.id = id
    self.name = name
    self.category = category
    self.tags = tags
    self.words = words
    self.records = records
    self.createdAt = createdAt
  }
}

public struct WorkspaceDocument: Equatable, Sendable {
  public var lists: [WordList]
  public var devices: [PracticeDevice]

  public init(lists: [WordList], devices: [PracticeDevice]) {
    self.lists = lists
    self.devices = devices
  }
}

/// A new random id in the form of `crypto.randomUUID`, as the web app gives records and lists.
public func randomId() -> String {
  UUID().uuidString.lowercased()
}

extension String {
  /// JavaScript's `trim`.
  var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
  /// JavaScript's `length`, which counts UTF-16 code units.
  var jsLength: Int { utf16.count }
  /// JavaScript's `Array.from`, which splits a string into code points.
  var codePoints: [Unicode.Scalar] { Array(unicodeScalars) }
}

extension Sequence {
  /// Array.prototype.sort is stable; this keeps equal elements in their original order as it does.
  func stableSorted(by areInIncreasingOrder: (Element, Element) -> Bool) -> [Element] {
    enumerated().sorted { a, b in
      if areInIncreasingOrder(a.element, b.element) { return true }
      if areInIncreasingOrder(b.element, a.element) { return false }
      return a.offset < b.offset
    }.map(\.element)
  }
}
