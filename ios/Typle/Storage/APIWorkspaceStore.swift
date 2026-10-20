import Foundation
import TypleCore

/// An account's cloud workspace through the Go API (docs/api.md), started with `-writable` behind HTTPS. The API
/// authenticates with the GitHub token and reads or writes only that user's data.
@MainActor
final class APIWorkspaceStore: WorkspaceStore {
  let accountId: String
  let canEditDevices = false
  let canDeleteRecords = false

  private let baseURL: URL
  private let token: String
  private let session: URLSession
  private var document: WorkspaceDocument?

  init(baseURL: URL, token: String, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.token = token
    self.session = session
    accountId = "api:\(baseURL.host ?? baseURL.absoluteString)"
  }

  // MARK: Reading

  private struct ListSummaries: Decodable { var lists: [Summary]; struct Summary: Decodable { var id: String } }
  private struct ListBody: Decodable { var list: APIList }
  private struct APIList: Decodable {
    var id: String
    var name: String
    var createdAt: String
    var words: [Word]
  }
  private struct Records: Decodable { var records: [StoredRecord] }
  private struct Devices: Decodable { var devices: [PracticeDevice] }
  private struct RecordBody: Decodable { var record: StoredRecord }
  private struct ErrorBody: Decodable { var error: String }

  func load() async throws -> WorkspaceDocument {
    let devices: Devices = try await get("devices")
    let summaries: ListSummaries = try await get("lists")
    let lists = try await withThrowingTaskGroup(of: (Int, WordList).self) { group in
      for (index, summary) in summaries.lists.enumerated() {
        group.addTask { @MainActor in
          let list = try await self.fetchList(id: summary.id)
          return (index, list)
        }
      }
      var lists: [(Int, WordList)] = []
      for try await item in group { lists.append(item) }
      return lists.sorted { $0.0 < $1.0 }.map(\.1)
    }
    let loaded = WorkspaceDocument(lists: lists, devices: devices.devices)
    document = loaded
    return loaded
  }

  private func fetchList(id: String) async throws -> WordList {
    let body: ListBody = try await get("lists/\(id)")
    // The API returns at most 1000 records, newest first; the app keeps them oldest first, as they were saved.
    let records: Records = try await get("lists/\(id)/records", query: [URLQueryItem(name: "limit", value: "1000")])
    return WordList(id: body.list.id, name: body.list.name, words: body.list.words, records: Array(records.records.reversed()), createdAt: body.list.createdAt)
  }

  // MARK: Writing

  private struct ListRequest: Encodable { var name: String; var words: [Word] }
  private struct RecordRequest: Encodable {
    var id: String?
    var time: Double
    var date: String
    var mistakes: Int
    var accuracy: Double
    var wordCount: Int?
    var deviceId: String?
  }

  private func current() throws -> WorkspaceDocument {
    guard let document else { throw TypleError("loadFailed") }
    return document
  }

  func saveList(_ list: WordList, editing: Bool) async throws -> WorkspaceDocument {
    // Checked here first, so mistakes are explained without a request and in the reader's language.
    _ = try TypleCore.saveList(try current().lists, list, editing: editing)
    let request = ListRequest(name: list.name.trimmingCharacters(in: .whitespacesAndNewlines), words: list.words)
    let body: ListBody
    if editing { body = try await send("PATCH", "lists/\(list.id)", request) }
    else { body = try await send("POST", "lists", request) }
    var next = try current()
    let saved = body.list
    if let index = next.lists.firstIndex(where: { $0.id == saved.id }) {
      next.lists[index].name = saved.name
      next.lists[index].words = saved.words
    } else {
      next.lists.append(WordList(id: saved.id, name: saved.name, words: saved.words, createdAt: saved.createdAt))
    }
    document = next
    return next
  }

  func duplicateList(id: String, suffix: @escaping (Int) -> String) async throws -> (WorkspaceDocument, WordList) {
    let lists = try current().lists
    let copy = try TypleCore.duplicateList(lists, id: id, copyId: randomId(), suffix: suffix).copy
    let next = try await saveList(copy, editing: false)
    return (next, next.lists.last ?? copy)
  }

  func deleteList(id: String) async throws -> WorkspaceDocument {
    try await sendWithoutBody("DELETE", "lists/\(id)")
    var next = try current()
    next.lists.removeAll { $0.id == id }
    document = next
    return next
  }

  func addRecord(_ record: StoredRecord, listId: String) async throws -> WorkspaceDocument {
    // The record keeps its id, so sending it again after a failure does not add it twice.
    let request = RecordRequest(id: record.id, time: record.time, date: record.date, mistakes: record.mistakes ?? 0,
                                accuracy: record.accuracy ?? 100, wordCount: record.wordCount, deviceId: record.device?.id)
    let body: RecordBody = try await send("POST", "lists/\(listId)/records", request)
    var next = try current()
    next.lists = try TypleCore.addRecord(next.lists, listId: listId, record: body.record)
    document = next
    return next
  }

  func deleteRecord(_ record: StoredRecord, listId: String) async throws -> WorkspaceDocument {
    throw TypleError("apiUnsupported")
  }

  func saveDevice(_ device: PracticeDevice, editing: Bool, defaultName: String) async throws -> WorkspaceDocument {
    throw TypleError("apiUnsupported")
  }

  func deleteDevice(id: String) async throws -> WorkspaceDocument {
    throw TypleError("apiUnsupported")
  }

  // MARK: HTTP

  private func url(_ path: String, query: [URLQueryItem] = []) -> URL {
    var components = URLComponents(url: baseURL.appendingPathComponent("api/v1/" + path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { components.queryItems = query }
    return components.url!
  }

  private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
    var request = URLRequest(url: url(path, query: query))
    request.httpMethod = "GET"
    return try decode(try await perform(request))
  }

  private func send<T: Decodable>(_ method: String, _ path: String, _ body: some Encodable) async throws -> T {
    var request = URLRequest(url: url(path))
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(body)
    return try decode(try await perform(request))
  }

  private func sendWithoutBody(_ method: String, _ path: String) async throws {
    var request = URLRequest(url: url(path))
    request.httpMethod = method
    _ = try await perform(request)
  }

  private func decode<T: Decodable>(_ data: Data) throws -> T {
    do { return try JSONDecoder().decode(T.self, from: data) } catch { throw TypleError("invalidServerData") }
  }

  private func perform(_ request: URLRequest) async throws -> Data {
    var request = request
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = 30
    let result: (Data, URLResponse)
    do { result = try await session.data(for: request) } catch { throw TypleError("apiUnreachable") }
    let (data, response) = result
    guard let http = response as? HTTPURLResponse else { throw TypleError("apiUnreachable") }
    guard (200..<300).contains(http.statusCode) else {
      let key = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
      throw Self.error(for: key, status: http.statusCode)
    }
    return data
  }

  /// The API's error keys, as messages of the app. Keys the API shares with the web app keep their message.
  static func error(for key: String?, status: Int) -> TypleError {
    switch key {
    case "invalidToken": return TypleError("apiInvalidToken")
    case "methodNotAllowed": return TypleError("apiReadOnly")
    case "githubUnavailable": return TypleError("apiGithubUnavailable")
    case "listNotFound": return TypleError("listDeleted")
    case "listLimit": return TypleError("listLimit", ["max": String(maxLists)])
    case "requestTooLarge", "workspaceTooLarge": return TypleError("workspaceTooLarge")
    case "listNameRequired", "listNameDuplicate", "wordsRequired", "wordFieldsRequired", "databaseUnavailable":
      return TypleError(key!)
    case "invalidList", "invalidRecord", "recordLimit", "deviceNotFound": return TypleError("apiRejected")
    default: return TypleError(status == 404 ? "apiNotFound" : "workspaceRequestFailed")
    }
  }
}
