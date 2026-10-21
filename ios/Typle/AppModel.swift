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
  /// The GitHub account, the same data as the web app's after its login.
  case account
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
  /// The web app the account is on.
  private(set) var serverURL: String
  /// Who the iPad signed in as, while it has a token.
  private(set) var accountUser: AccountUser?
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
    // The self-hosted API (storage "api") is gone; its choice falls back to this iPad.
    Keychain.removeLegacyToken()
    var storage = StorageKind(rawValue: defaults.string(forKey: "typle-r:storage") ?? "") ?? .local
    let serverURL = defaults.string(forKey: "typle-r:server-url") ?? Self.defaultServerURL
    let accountUser = Keychain.token() == nil ? nil : defaults.data(forKey: "typle-r:account").flatMap { try? JSONDecoder().decode(AccountUser.self, from: $0) }
    if accountUser == nil { storage = .local }
    self.storage = storage
    self.serverURL = serverURL
    self.accountUser = accountUser
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
    let store = Self.makeStore(storage, serverURL: serverURL, user: accountUser) ?? LocalWorkspaceStore()
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

  /// The web app in production (docs/release-workflow.md).
  static let defaultServerURL = "https://typle-r-six.vercel.app"

  private static func makeStore(_ storage: StorageKind, serverURL: String, user: AccountUser?) -> (any WorkspaceStore)? {
    switch storage {
    case .local: return LocalWorkspaceStore()
    case .account:
      guard let url = serverAddress(serverURL), let token = Keychain.token(), let user else { return nil }
      return AccountWorkspaceStore(baseURL: url, token: token, accountId: user.id) { Keychain.setToken($0) }
    }
  }

  /// An HTTPS address, since the token must not travel in plain text. Plain HTTP is allowed for this iPad itself
  /// and local network names only, as when the web app runs on a Mac next to it (npm run dev).
  static func serverAddress(_ text: String) -> URL? {
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

  /// Signs in with GitHub through the web app at serverURL, and then keeps the workspace in that account.
  /// `authenticate` shows the login (ASWebAuthenticationSession) and returns the URL it ended at.
  func signIn(serverURL text: String, authenticate: (URL, String) async throws -> URL) async throws {
    guard let url = Self.serverAddress(text) else { throw TypleError("accountInvalidURL") }
    let login = AccountLogin(baseURL: url)
    let (token, user) = try await login.finish(try await authenticate(login.signinURL, AccountLogin.callbackScheme))
    guard Keychain.setToken(token), let saved = try? JSONEncoder().encode(user) else { throw TypleError("accountKeychainFailed") }
    serverURL = url.absoluteString
    defaults.set(serverURL, forKey: "typle-r:server-url")
    defaults.set(saved, forKey: "typle-r:account")
    accountUser = user
    try await useStorage(.account)
  }

  /// Switches where the workspace is kept. The two are separate and nothing is copied between them.
  func useStorage(_ kind: StorageKind) async throws {
    guard let next = Self.makeStore(kind, serverURL: serverURL, user: accountUser) else { throw TypleError("accountLoginRequired") }
    storage = kind
    defaults.set(kind.rawValue, forKey: "typle-r:storage")
    store = next
    document = nil
    selectedDeviceId = defaults.string(forKey: "typle-r:device:\(next.accountId)")
    await reload()
  }

  /// Forgets the token and goes back to this iPad's data. The token is a signed value the backend keeps no record of,
  /// as the web app's cookie is, so there is nothing to revoke.
  func signOut() async {
    Keychain.setToken(nil)
    defaults.removeObject(forKey: "typle-r:account")
    accountUser = nil
    try? await useStorage(.local)
  }

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
