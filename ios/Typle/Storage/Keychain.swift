import Foundation
import Security

/// The token the iPad app signs in to the account with, kept in the Keychain on this iPad only.
enum Keychain {
  private static let service = "typle.account-token"
  private static let account = "github"
  /// Where the GitHub token for the self-hosted API (before v0.56.0) was kept.
  private static let legacyService = "typle.api-token"

  private static func query(_ service: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
  }

  static func token() -> String? {
    var request = query(service)
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  @discardableResult
  static func setToken(_ token: String?) -> Bool {
    SecItemDelete(query(service) as CFDictionary)
    guard let token, !token.isEmpty else { return true }
    var item = query(service)
    item[kSecValueData as String] = Data(token.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
  }

  /// Forgets the GitHub token of the self-hosted API, which the app no longer uses.
  static func removeLegacyToken() {
    SecItemDelete(query(legacyService) as CFDictionary)
  }
}
