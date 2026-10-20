import Foundation
import Observation
import TypleCore

/// The web app's pages, in the order of its sidebar.
enum Route: Hashable {
  case home, practice, records, rankings, lists, createList, editList(String), general, devices

  /// The sidebar item a page belongs to; the list editor belongs to 単語リスト as /edit/<id> does.
  var navigationItem: Route {
    if case .editList = self { return .lists }
    return self
  }

  /// For launch arguments (`-TypleRoute records`) when taking screenshots.
  init?(name: String) {
    let routes: [String: Route] = ["home": .home, "practice": .practice, "records": .records, "rankings": .rankings,
                                   "lists": .lists, "createList": .createList, "general": .general, "devices": .devices]
    guard let route = routes[name] else { return nil }
    self = route
  }
}

enum Appearance: String {
  case system, light, dark
}

enum StorageKind: String, CaseIterable, Identifiable {
  /// This iPad's file, the default.
  case local
  /// An account through the Go API.
  case api
  var id: String { rawValue }
}

/// The app's state: the workspace of the chosen store and the choices remembered on this iPad.
@MainActor
@Observable
final class AppModel {
  private let defaults: UserDefaults

  var route: Route = .home
  /// The list the best records page shows, like `/rankings?list=<id>`.
  var rankingsList: String? = nil
  /// A list another screen asked the practice screen to open, like `/play?list=<id>`.
  var practiceRequest: String? = nil

  private(set) var storage: StorageKind
  private(set) var serverURL: String
  private(set) var store: any WorkspaceStore
  private(set) var document: WorkspaceDocument? = nil
  private(set) var loading = false
  private(set) var loadError: String? = nil

  /// Whether the practice screen shows the live elapsed time, speed, accuracy and mistakes.
  private(set) var liveStatsVisible: Bool
  /// The stored device choice for the current store: a device id, "" for 未選択, or nil before the first choice.
  private(set) var selectedDeviceId: String? = nil
  /// The display language, chosen in 一般 like the web app's.
  private(set) var language: AppLanguage
  private(set) var appearance: Appearance

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    let storage = StorageKind(rawValue: defaults.string(forKey: "typle-r:storage") ?? "") ?? .local
    let serverURL = defaults.string(forKey: "typle-r:api-url") ?? ""
    self.storage = storage
    self.serverURL = serverURL
    liveStatsVisible = !defaults.bool(forKey: "typle-r:live-stats-hidden")
    let language = AppLanguage(rawValue: defaults.string(forKey: "typle-r:language") ?? "") ?? .preferred
    self.language = language
    Localization.use(language)
    appearance = Appearance(rawValue: defaults.string(forKey: "typle-r:theme") ?? "") ?? .system
    #if DEBUG
    if let demo = DemoData.store(defaults: defaults) {
      store = demo
      selectedDeviceId = nil
      if let name = defaults.string(forKey: "TypleRoute") {
        if name == "editList" { self.route = .editList("sample-1") } else if let route = Route(name: name) { self.route = route }
      }
      rankingsList = defaults.string(forKey: "TypleRankingsList")
      return
    }
    #endif
    let store = Self.makeStore(storage, serverURL: serverURL) ?? LocalWorkspaceStore()
    self.store = store
    selectedDeviceId = defaults.string(forKey: "typle-r:device:\(store.accountId)")
  }

  func setLanguage(_ language: AppLanguage) {
    self.language = language
    Localization.use(language)
    defaults.set(language.rawValue, forKey: "typle-r:language")
  }

  /// The top bar's switch, which like the web app's sets light or dark from what is showing now.
  func setAppearance(_ appearance: Appearance) {
    self.appearance = appearance
    defaults.set(appearance.rawValue, forKey: "typle-r:theme")
  }

  func navigate(_ route: Route) {
    self.route = route
  }

  func setLiveStatsVisible(_ visible: Bool) {
    liveStatsVisible = visible
    defaults.set(!visible, forKey: "typle-r:live-stats-hidden")
  }

  private static func makeStore(_ storage: StorageKind, serverURL: String) -> (any WorkspaceStore)? {
    switch storage {
    case .local: return LocalWorkspaceStore()
    case .api:
      guard let url = apiURL(serverURL), let token = Keychain.token() else { return nil }
      return APIWorkspaceStore(baseURL: url, token: token)
    }
  }

  /// An HTTPS address, since the token must not travel in plain text. Plain HTTP is allowed for this iPad itself
  /// and local network names only, as when the API runs on a Mac next to it.
  static func apiURL(_ text: String) -> URL? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed), let host = url.host, !host.isEmpty else { return nil }
    if url.scheme == "https" { return url }
    if url.scheme == "http" && (host == "localhost" || host == "127.0.0.1" || host.hasSuffix(".local")) { return url }
    return nil
  }

  var lists: [WordList] { document?.lists ?? [] }
  var devices: [PracticeDevice] { document?.devices ?? [] }
  var defaultDeviceName: String { L("format.defaultDevice") }

  /// The device this iPad practises on: the built-in デフォルト until another is chosen, or none for 未選択.
  var chosenPracticeDevice: PracticeDevice? {
    chosenDevice(devices, id: selectedDeviceId, defaultName: defaultDeviceName)
  }

  func chooseDevice(_ id: String) {
    selectedDeviceId = id
    defaults.set(id, forKey: "typle-r:device:\(store.accountId)")
  }

  func reload() async {
    loading = true
    loadError = nil
    let current = store
    do {
      let loaded = try await current.load()
      // A store switched while this one was loading has its own load.
      guard current === store else { return }
      document = loaded
    } catch {
      guard current === store else { return }
      document = nil
      loadError = errorText(error)
    }
    loading = false
  }

  /// Switches where the workspace is kept. The two are separate and nothing is copied between them.
  func useStorage(_ kind: StorageKind, serverURL: String? = nil, token: String? = nil) async throws {
    if let serverURL {
      guard Self.apiURL(serverURL) != nil else { throw TypleError("apiInvalidURL") }
      self.serverURL = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
      defaults.set(self.serverURL, forKey: "typle-r:api-url")
    }
    if let token { Keychain.setToken(token.trimmingCharacters(in: .whitespacesAndNewlines)) }
    guard let next = Self.makeStore(kind, serverURL: self.serverURL) else { throw TypleError("apiNotConfigured") }
    storage = kind
    defaults.set(kind.rawValue, forKey: "typle-r:storage")
    store = next
    document = nil
    selectedDeviceId = defaults.string(forKey: "typle-r:device:\(next.accountId)")
    await reload()
  }

  /// Forgets the token and goes back to this iPad's data.
  func signOut() async {
    Keychain.setToken(nil)
    try? await useStorage(.local)
  }

  var hasToken: Bool { Keychain.token() != nil }

  // MARK: Changes. Each throws the reason it failed, for the screen to show; the shown data stays as it was.

  private func apply(_ change: (any WorkspaceStore) async throws -> WorkspaceDocument) async throws {
    let current = store
    let next = try await change(current)
    if current === store { document = next }
  }

  func saveList(_ list: WordList, editing: Bool) async throws {
    try await apply { try await $0.saveList(list, editing: editing) }
  }

  @discardableResult
  func duplicateList(id: String) async throws -> WordList {
    let current = store
    let (next, copy) = try await current.duplicateList(id: id) { n in n == 1 ? L("lists.copySuffix") : L("lists.copySuffixNumbered", n) }
    if current === store { document = next }
    return copy
  }

  func deleteList(id: String) async throws {
    try await apply { try await $0.deleteList(id: id) }
  }

  func addRecord(_ record: StoredRecord, listId: String) async throws {
    try await apply { try await $0.addRecord(record, listId: listId) }
  }

  func deleteRecord(_ record: StoredRecord, listId: String) async throws {
    try await apply { try await $0.deleteRecord(record, listId: listId) }
  }

  func saveDevice(_ device: PracticeDevice, editing: Bool) async throws {
    let name = defaultDeviceName
    try await apply { try await $0.saveDevice(device, editing: editing, defaultName: name) }
  }

  func deleteDevice(id: String) async throws {
    try await apply { try await $0.deleteDevice(id: id) }
  }

  func practice(listId: String) {
    practiceRequest = listId
    route = .practice
  }

  func showRankings(listId: String?) {
    rankingsList = listId
    route = .rankings
  }
}
