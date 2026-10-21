import Foundation
import TypleCore

/// The signed-in account's workspace through the web app's `/api/workspace`, the same data the web app shows after a
/// GitHub login. Every change is a save of the whole document for the revision it was made from; when the data was
/// changed elsewhere since (409 conflict), the latest is read and the change made again on it.
@MainActor
final class AccountWorkspaceStore: WorkspaceStore {
  let accountId: String

  private let client: AccountClient
  private var token: String
  /// Keeps a token the backend renewed.
  private let renewed: (String) -> Void
  private var saved: AccountWorkspace?

  /// How many times a change is made again after a conflict, for changes saved while others are in flight.
  private static let attempts = 3

  init(baseURL: URL, token: String, accountId: String, renewed: @escaping (String) -> Void) {
    client = AccountClient(baseURL: baseURL)
    self.token = token
    self.accountId = accountId
    self.renewed = renewed
  }

  private struct SessionAnswer: Decodable { var user: AccountUser?; var token: String? }

  func load() async throws -> WorkspaceDocument {
    // The session renews a token that has grown old, so a user who practises keeps signed in.
    let answer: SessionAnswer = try client.decode(try await client.send("GET", "api/auth/session", token: token))
    guard let user = answer.user, user.id == accountId else { throw TypleError("accountLoginRequired") }
    if let next = answer.token {
      token = next
      renewed(next)
    }
    let loaded = try await read()
    saved = loaded
    return loaded.document
  }

  private func read() async throws -> AccountWorkspace {
    let loaded = try decodeAccountWorkspace(try await client.send("GET", "api/workspace", token: token))
    guard loaded.accountId == accountId else { throw TypleError("accountLoginRequired") }
    return loaded
  }

  private func change(_ transform: (WorkspaceDocument) throws -> WorkspaceDocument) async throws -> WorkspaceDocument {
    guard var current = saved else { throw TypleError("loadFailed") }
    for attempt in 1...Self.attempts {
      var next = current
      next.document = try transform(current.document)
      do {
        let written = try decodeAccountWorkspace(try await client.send("PUT", "api/workspace", body: try encodeAccountWorkspace(next), token: token))
        // A later save may have finished first; the newer revision is kept.
        if saved.map({ $0.revision < written.revision }) ?? true { saved = written }
        return saved?.document ?? written.document
      } catch let error as TypleError where error.key == "conflict" && attempt < Self.attempts {
        current = try await read()
        saved = current
      }
    }
    throw TypleError("conflict")
  }

  func saveList(_ list: WordList, editing: Bool) async throws -> WorkspaceDocument {
    try await change { document in
      var document = document
      document.lists = try TypleCore.saveList(document.lists, list, editing: editing)
      return document
    }
  }

  func duplicateList(id: String, suffix: @escaping (Int) -> String) async throws -> (WorkspaceDocument, WordList) {
    var copy: WordList?
    let copyId = randomId()
    let document = try await change { document in
      var document = document
      let result = try TypleCore.duplicateList(document.lists, id: id, copyId: copyId, suffix: suffix)
      document.lists = result.lists
      copy = result.copy
      return document
    }
    return (document, copy!)
  }

  func deleteList(id: String) async throws -> WorkspaceDocument {
    try await change { document in
      var document = document
      document.lists.removeAll { $0.id == id }
      return document
    }
  }

  func addRecord(_ record: StoredRecord, listId: String) async throws -> WorkspaceDocument {
    try await change { document in
      var document = document
      document.lists = try TypleCore.addRecord(document.lists, listId: listId, record: record)
      return document
    }
  }

  func deleteRecord(_ record: StoredRecord, listId: String) async throws -> WorkspaceDocument {
    try await change { document in
      var document = document
      document.lists = removeRecord(document.lists, listId: listId, record: record)
      return document
    }
  }

  func saveDevice(_ device: PracticeDevice, editing: Bool, defaultName: String) async throws -> WorkspaceDocument {
    try await change { document in
      var document = document
      document.devices = try TypleCore.saveDevice(document.devices, device, editing: editing, defaultName: defaultName)
      return document
    }
  }

  func deleteDevice(id: String) async throws -> WorkspaceDocument {
    try await change { document in
      var document = document
      document.devices.removeAll { $0.id == id }
      return document
    }
  }
}
