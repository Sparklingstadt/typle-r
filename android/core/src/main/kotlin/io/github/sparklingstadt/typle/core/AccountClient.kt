package io.github.sparklingstadt.typle.core

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

// Requests to the web app's Go backend (`/api/auth/*`, `/api/workspace`). Mirrors ios/Typle/Storage/AccountClient.swift.

@Serializable
private data class ErrorBody(val error: String)

/**
 * Requests to the web app's Go backend, with the app's token when it has one. Blocking: call it off the main thread.
 * Its errors are the app's messages.
 */
class AccountClient(val baseUrl: URI) {
  /** `<base>/<path>`, whether or not the base ends with a slash; [query] values are percent-encoded. */
  fun url(path: String, query: List<Pair<String, String>> = emptyList()): URI {
    val base = baseUrl.toString().trimEnd('/') + "/" + path.trimStart('/')
    if (query.isEmpty()) return URI(base)
    return URI(base + "?" + query.joinToString("&") { (name, value) -> "${encode(name)}=${encode(value)}" })
  }

  fun send(method: String, path: String, body: ByteArray? = null, token: String? = null): ByteArray {
    val connection = try {
      url(path).toURL().openConnection() as HttpURLConnection
    } catch (_: IOException) {
      throw TypleException("accountUnreachable")
    } catch (_: IllegalArgumentException) {
      throw TypleException("accountUnreachable")
    }
    try {
      connection.requestMethod = method
      connection.connectTimeout = TIMEOUT_MILLIS
      connection.readTimeout = TIMEOUT_MILLIS
      connection.useCaches = false
      // The token must not follow a redirect to another address.
      connection.instanceFollowRedirects = false
      connection.setRequestProperty("Accept", "application/json")
      if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
      if (body != null) {
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.use { it.write(body) }
      }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val data = stream?.use { it.readBytes() } ?: ByteArray(0)
      if (status !in 200..299) throw accountError(errorKey(data), status)
      return data
    } catch (e: TypleException) {
      throw e
    } catch (_: IOException) {
      throw TypleException("accountUnreachable")
    } finally {
      connection.disconnect()
    }
  }

  private fun errorKey(data: ByteArray): String? = try {
    TypleJson.decodeFromString(ErrorBody.serializer(), data.decodeToString()).error
  } catch (_: SerializationException) {
    null
  } catch (_: IllegalArgumentException) {
    null
  }

  private fun encode(text: String): String = URLEncoder.encode(text, "UTF-8").replace("+", "%20")

  private companion object {
    const val TIMEOUT_MILLIS = 30_000
  }
}

@Serializable
private data class TokenRequest(val code: String, val verifier: String)

@Serializable
private data class TokenAnswer(val token: String, val user: AccountUser)

/**
 * One GitHub login of the app, through the web app's login (docs/api.md): it opens `/api/auth/signin` with its own PKCE
 * challenge, the login ends at `typle-r://login?code=…`, and the code and the verifier, which never leaves the app, are
 * traded for the app's token.
 */
class AccountLogin(baseUrl: URI, val verifier: String = newVerifier()) {
  val client = AccountClient(baseUrl)

  /** Where the login starts, for the custom tab that shows it. */
  val signinUrl: URI
    get() = client.url("api/auth/signin", listOf("client" to "android", "code_challenge" to challengeOf(verifier)))

  /** Trades the URL the login ended at for the app's token and the account. */
  fun finish(callback: String): Pair<String, AccountUser> {
    val code = codeOf(callback) ?: throw TypleException("accountLoginFailed")
    val body = TypleJson.encodeToString(TokenRequest.serializer(), TokenRequest(code, verifier)).encodeToByteArray()
    val answer = try {
      TypleJson.decodeFromString(TokenAnswer.serializer(), client.send("POST", "api/auth/token", body).decodeToString())
    } catch (_: SerializationException) {
      throw TypleException("invalidServerData")
    } catch (_: IllegalArgumentException) {
      throw TypleException("invalidServerData")
    }
    return answer.token to answer.user
  }

  /** The `code` of `typle-r://login?code=…`; null for any other address, an error answer or an empty code. */
  private fun codeOf(callback: String): String? {
    val uri = try { URI(callback) } catch (_: Exception) { return null }
    if (uri.scheme != CALLBACK_SCHEME || uri.host != "login") return null
    val query = uri.rawQuery ?: return null
    for (pair in query.split('&')) {
      val name = pair.substringBefore('=')
      if (!pair.contains('=') || decode(name) != "code") continue
      return decode(pair.substringAfter('=')).takeIf { it.isNotEmpty() }
    }
    return null
  }

  private fun decode(text: String): String = try {
    URLDecoder.decode(text, "UTF-8")
  } catch (_: IllegalArgumentException) {
    ""
  }

  companion object {
    const val CALLBACK_SCHEME = "typle-r"

    // 32 random bytes are a verifier of 43 characters, as the web app's login makes its own.
    fun newVerifier(): String = base64Url(ByteArray(32).also { SecureRandom().nextBytes(it) })

    fun challengeOf(verifier: String): String = base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.encodeToByteArray()))

    private fun base64Url(data: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(data)
  }
}
