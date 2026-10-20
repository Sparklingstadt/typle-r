import Foundation

// src/plugins/formats/delimited.ts

/// Larger word files are refused before they are read.
public let maxImportBytes = 1024 * 1024

public enum WordFileFormat: String, CaseIterable, Sendable {
  case csv, tsv

  var delimiter: Unicode.Scalar { self == .csv ? "," : "\t" }

  /// The format for a file name's extension, or nil for other files.
  public init?(fileName: String) {
    self.init(rawValue: (fileName as NSString).pathExtension.lowercased())
  }
}

/// Reads a UTF-8 word file, refusing other encodings and files over the size limit.
public func parseWordData(_ data: Data, format: WordFileFormat) throws -> [Word] {
  if data.count > maxImportBytes { throw TypleError("importTooLarge") }
  guard let text = String(data: data, encoding: .utf8) else { throw TypleError("importFileEncoding") }
  return try parseWordFile(text, format: format)
}

/// Reads CSV and TSV, including escaped quotes and quoted multiline fields.
public func parseWordFile(_ source: String, format: WordFileFormat) throws -> [Word] {
  if source.utf8.count > maxImportBytes { throw TypleError("importTooLarge") }
  let delimiter = format.delimiter
  var text = Array(source.unicodeScalars)
  if text.first == "\u{FEFF}" { text.removeFirst() }
  var rows: [(cells: [String], line: Int)] = []
  var cells: [String] = []
  var value = String.UnicodeScalarView()
  var quoted = false, closed = false
  var line = 1, start = 1
  func fail() -> TypleError { TypleError("importQuote", ["line": String(line)]) }
  func field() {
    cells.append(String(value))
    value = String.UnicodeScalarView()
    closed = false
  }
  func row() {
    let explicit = closed
    field()
    if cells.count > 1 || cells.contains(where: { !$0.trimmed.isEmpty }) || explicit { rows.append((cells, start)) }
    cells = []
  }
  var i = 0
  while i < text.count {
    let c = text[i]
    let next: Unicode.Scalar? = i + 1 < text.count ? text[i + 1] : nil
    if quoted {
      if c == "\"" {
        if next == "\"" { value.append("\""); i += 1 } else { quoted = false; closed = true }
      } else {
        value.append(c)
        if c == "\n" || (c == "\r" && next != "\n") { line += 1 }
      }
    } else if c == delimiter {
      field()
    } else if c == "\r" || c == "\n" {
      row()
      if c == "\r" && next == "\n" { i += 1 }
      line += 1
      start = line
    } else if closed {
      throw fail()
    } else if c == "\"" {
      if !value.isEmpty { throw fail() }
      quoted = true
    } else {
      value.append(c)
    }
    i += 1
  }
  if quoted { throw fail() }
  row()
  let header = rows.isEmpty ? [] : rows.removeFirst().cells.map { $0.trimmed == "anotation" ? "annotation" : $0.trimmed }
  if !header.contains("input") || !header.contains("display") { throw TypleError("importHeaderRequired") }
  if Set(header).count != header.count { throw TypleError("importHeaderDuplicate") }
  if header.contains(where: { !["input", "display", "annotation"].contains($0) }) { throw TypleError("importHeaderUnknown") }
  if rows.isEmpty { throw TypleError("importNoRows") }
  if rows.count > maxWords { throw TypleError("importTooManyRows") }
  return try rows.map { cells, line in
    if cells.count != header.count { throw TypleError("importColumnCount", ["line": String(line)]) }
    func get(_ name: String) -> String { header.firstIndex(of: name).map { cells[$0] } ?? "" }
    let word = Word(display: get("display"), input: get("input"), annotation: get("annotation"))
    if word.input.trimmed.isEmpty || word.display.trimmed.isEmpty { throw TypleError("importFieldRequired", ["line": String(line)]) }
    if word.input.jsLength > maxWordField || word.display.jsLength > maxWordField || word.annotation.jsLength > maxAnnotation {
      throw TypleError("importFieldTooLong", ["line": String(line)])
    }
    return word
  }
}

/// Keeps exact typing strings, including whitespace, quotes and newlines.
public func encodeWordCsv(_ words: [Word]) -> String {
  func cell(_ value: String) -> String { "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }
  return "\u{FEFF}input,display,annotation\r\n" +
    words.map { [$0.input, $0.display, $0.annotation].map(cell).joined(separator: ",") }.joined(separator: "\r\n") + "\r\n"
}
