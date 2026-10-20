import Foundation

// The lists an account starts with (src/plugins/packs). They are shown until the first save, which keeps them as the
// account's own lists. The JSON files are copies; tests/iosPacks.test.cjs checks they match.
private struct PackList: Decodable {
  var id: String?
  var name: String
  var words: [Word]
  var records: [StoredRecord]?
  var createdAt: String
}

public func initialLists() -> [WordList] {
  func load(_ name: String) -> Data {
    guard let url = Bundle.module.url(forResource: name, withExtension: "json"), let data = try? Data(contentsOf: url) else {
      fatalError("Missing bundled pack \(name).json")
    }
    return data
  }
  do {
    let samples = try JSONDecoder().decode([PackList].self, from: load("samples"))
    let countries = try JSONDecoder().decode(PackList.self, from: load("countries"))
    return samples.enumerated().map { index, list in
      WordList(id: "sample-\(index + 1)", name: list.name, words: list.words, records: [], createdAt: list.createdAt)
    } + [WordList(id: countries.id ?? "countries", name: countries.name, words: countries.words,
                  records: countries.records ?? [], createdAt: countries.createdAt)]
  } catch {
    fatalError("Unreadable bundled pack: \(error)")
  }
}

/// The local workspace file, in the shape of the web app's browser storage (`typle-r:guest-workspace:v1`).
public struct WorkspaceFile: Codable, Equatable, Sendable {
  public var version: Int
  public var accountId: String
  public var revision: Int
  public var lists: [WordList]
  public var devices: [PracticeDevice]

  public init(accountId: String, revision: Int, document: WorkspaceDocument) {
    version = 1
    self.accountId = accountId
    self.revision = revision
    lists = document.lists
    devices = document.devices
  }

  public var document: WorkspaceDocument { WorkspaceDocument(lists: lists, devices: devices) }
}

/// A saved workspace may hold up to 1 MiB of lists, like an account.
public let maxWorkspaceBytes = 1024 * 1024

public func decodeWorkspaceFile(_ data: Data, accountId: String) throws -> WorkspaceFile {
  let file: WorkspaceFile
  do { file = try JSONDecoder().decode(WorkspaceFile.self, from: data) } catch { throw TypleError("savedDataUnreadable") }
  guard file.version == 1, file.accountId == accountId, file.revision >= 0 else { throw TypleError("savedDataUnreadable") }
  try validateLists(file.lists)
  var decoded = file
  decoded.devices = try decodeDevices(file.devices)
  return decoded
}

public func encodeWorkspaceFile(_ file: WorkspaceFile) throws -> Data {
  try validateLists(file.lists)
  _ = try decodeDevices(file.devices)
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.withoutEscapingSlashes]
  if try encoder.encode(file.lists).count > maxWorkspaceBytes { throw TypleError("guestQuotaExceeded") }
  return try encoder.encode(file)
}
