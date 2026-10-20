import Foundation
import Security

/// The GitHub token for the API, kept in the Keychain on this iPad only.
enum Keychain {
  private static let service = "typle.api-token"
  private static let account = "github"

  private static var query: [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
  }

  static func token() -> String? {
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  @discardableResult
  static func setToken(_ token: String?) -> Bool {
    SecItemDelete(query as CFDictionary)
    guard let token, !token.isEmpty else { return true }
    var item = query
    item[kSecValueData as String] = Data(token.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
  }
}
