import Foundation
import TypleCore

/// Where a workspace is kept: on this iPad, or in an account through the Go API (docs/api.md). Each store keeps the
/// document it last read or wrote, and applies every change to that, so changes made while another is in flight are
/// not lost.
@MainActor
protocol WorkspaceStore: AnyObject {
  /// Names the data the stored device choice belongs to, like `typle-r:device:<accountId>` in the web app.
  var accountId: String { get }
  /// The API can neither change devices nor delete records.
  var canEditDevices: Bool { get }
  var canDeleteRecords: Bool { get }

  func load() async throws -> WorkspaceDocument
  func saveList(_ list: WordList, editing: Bool) async throws -> WorkspaceDocument
  func duplicateList(id: String, suffix: @escaping (Int) -> String) async throws -> (WorkspaceDocument, WordList)
  func deleteList(id: String) async throws -> WorkspaceDocument
  func addRecord(_ record: StoredRecord, listId: String) async throws -> WorkspaceDocument
  func deleteRecord(_ record: StoredRecord, listId: String) async throws -> WorkspaceDocument
  func saveDevice(_ device: PracticeDevice, editing: Bool, defaultName: String) async throws -> WorkspaceDocument
  func deleteDevice(id: String) async throws -> WorkspaceDocument
}

/// The workspace in Application Support, in the shape of the web app's browser storage. A file that cannot be read
/// is left untouched: every change fails until it is moved away or fixed.
@MainActor
final class LocalWorkspaceStore: WorkspaceStore {
  let accountId = "ipad:local"
  let canEditDevices = true
  let canDeleteRecords = true

  private let url: URL
  private var file: WorkspaceFile?

  init(directory: URL? = nil) {
    let base = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    url = base.appendingPathComponent("workspace.json")
  }

  func load() async throws -> WorkspaceDocument {
    file = nil
    guard FileManager.default.fileExists(atPath: url.path) else {
      // The starting lists are shown until the first save, which keeps them.
      let initial = WorkspaceFile(accountId: accountId, revision: 0, document: WorkspaceDocument(lists: initialLists(), devices: []))
      file = initial
      return initial.document
    }
    do {
      let loaded = try decodeWorkspaceFile(try Data(contentsOf: url), accountId: accountId)
      file = loaded
      return loaded.document
    } catch {
      throw TypleError("localReadFailed")
    }
  }

  private func change(_ transform: (WorkspaceDocument) throws -> WorkspaceDocument) throws -> WorkspaceDocument {
    guard let current = file else { throw TypleError("localReadFailed") }
    let next = WorkspaceFile(accountId: accountId, revision: current.revision + 1, document: try transform(current.document))
    let data = try encodeWorkspaceFile(next)
    do {
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    } catch {
      throw TypleError("localWriteFailed")
    }
    file = next
    return next.document
  }

  func saveList(_ list: WordList, editing: Bool) async throws -> WorkspaceDocument {
    try change { document in
      var document = document
      document.lists = try TypleCore.saveList(document.lists, list, editing: editing)
      return document
    }
  }

  func duplicateList(id: String, suffix: @escaping (Int) -> String) async throws -> (WorkspaceDocument, WordList) {
    var copy: WordList?
    let document = try change { document in
      var document = document
      let result = try TypleCore.duplicateList(document.lists, id: id, copyId: randomId(), suffix: suffix)
      document.lists = result.lists
      copy = result.copy
      return document
    }
    return (document, copy!)
  }

  func deleteList(id: String) async throws -> WorkspaceDocument {
    try change { document in
      var document = document
      document.lists.removeAll { $0.id == id }
      return document
    }
  }

  func addRecord(_ record: StoredRecord, listId: String) async throws -> WorkspaceDocument {
    try change { document in
      var document = document
      document.lists = try TypleCore.addRecord(document.lists, listId: listId, record: record)
      return document
    }
  }

  func deleteRecord(_ record: StoredRecord, listId: String) async throws -> WorkspaceDocument {
    try change { document in
      var document = document
      document.lists = removeRecord(document.lists, listId: listId, record: record)
      return document
    }
  }

  func saveDevice(_ device: PracticeDevice, editing: Bool, defaultName: String) async throws -> WorkspaceDocument {
    try change { document in
      var document = document
      document.devices = try TypleCore.saveDevice(document.devices, device, editing: editing, defaultName: defaultName)
      return document
    }
  }

  func deleteDevice(id: String) async throws -> WorkspaceDocument {
    try change { document in
      var document = document
      document.devices.removeAll { $0.id == id }
      return document
    }
  }
}
