import CryptoKit
import Foundation
import TypleCore

/// The GitHub account the iPad app signed in with, as `/api/auth/token` and `/api/auth/session` name it.
struct AccountUser: Codable, Equatable {
  var id: String
  var name: String
}

/// Requests to the web app's Go backend (`/api/auth/*`, `/api/workspace`), with the app's token when it has one. Its
/// errors are the app's messages.
struct AccountClient {
  let baseURL: URL
  var session: URLSession = .shared

  private struct ErrorBody: Decodable { var error: String }

  func url(_ path: String, query: [URLQueryItem] = []) -> URL {
    var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { components.queryItems = query }
    return components.url!
  }

  func send(_ method: String, _ path: String, body: Data? = nil, token: String? = nil) async throws -> Data {
    var request = URLRequest(url: url(path))
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    if let body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = body
    }
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.timeoutInterval = 30
    let result: (Data, URLResponse)
    do { result = try await session.data(for: request) } catch { throw TypleError("accountUnreachable") }
    let (data, response) = result
    guard let http = response as? HTTPURLResponse else { throw TypleError("accountUnreachable") }
    guard (200..<300).contains(http.statusCode) else {
      throw Self.error(for: (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error, status: http.statusCode)
    }
    return data
  }

  func decode<T: Decodable>(_ data: Data) throws -> T {
    do { return try JSONDecoder().decode(T.self, from: data) } catch { throw TypleError("invalidServerData") }
  }

  /// The backend's error keys, as messages of the app. Keys the web app shows keep their message.
  static func error(for key: String?, status: Int) -> TypleError {
    switch key {
    case "loginRequired", "loginAccountChanged": return TypleError("accountLoginRequired")
    case "loginFailed": return TypleError("accountLoginFailed")
    case "authUnavailable": return TypleError("accountUnavailable")
    case "listLimit": return TypleError("listLimit", ["max": String(maxLists)])
    case "conflict", "workspaceTooLarge", "databaseUnavailable", "invalidWorkspace", "workspaceSaveFailed", "forbiddenRequest", "emptyRequest":
      return TypleError(key!)
    default: return TypleError(status == 404 ? "accountNotFound" : "workspaceRequestFailed")
    }
  }
}

/// One GitHub login of the app, through the web app's login (docs/api.md): it opens `/api/auth/signin` with its own
/// PKCE challenge, the login ends at `typle-r://login?code=…`, and the code and the verifier, which never leaves the
/// app, are traded for the app's token.
struct AccountLogin {
  static let callbackScheme = "typle-r"

  let client: AccountClient
  private let verifier: String

  init(baseURL: URL) {
    client = AccountClient(baseURL: baseURL)
    // 32 random bytes are a verifier of 43 characters, as the web app's login makes its own.
    verifier = Self.base64URL(SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) })
  }

  private static func base64URL(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  /// Where the login starts, for ASWebAuthenticationSession.
  var signinURL: URL {
    let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    return client.url("api/auth/signin", query: [URLQueryItem(name: "client", value: "ipad"), URLQueryItem(name: "code_challenge", value: challenge)])
  }

  private struct TokenRequest: Encodable { var code: String; var verifier: String }
  private struct TokenAnswer: Decodable { var token: String; var user: AccountUser }

  /// Trades the URL the login ended at for the app's token.
  func finish(_ callback: URL) async throws -> (token: String, user: AccountUser) {
    let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
    guard callback.scheme == Self.callbackScheme, callback.host == "login",
          let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
      throw TypleError("accountLoginFailed")
    }
    let body = try JSONEncoder().encode(TokenRequest(code: code, verifier: verifier))
    let answer: TokenAnswer = try client.decode(try await client.send("POST", "api/auth/token", body: body))
    return (answer.token, answer.user)
  }
}
