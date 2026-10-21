package io.github.sparklingstadt.typle.core

import java.net.URI
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

// The account's workspace as `/api/workspace` answers and saves it (src/plugins/storage/cloud/client.ts). Mirrors
// ios/TypleCore/Sources/TypleCore/AccountWorkspace.swift.

/** Where the app talks to by default: the web app's deployment. */
const val DEFAULT_ACCOUNT_URL = "https://typle-r-six.vercel.app"

/** The GitHub account the app signed in with, as `/api/auth/token` and `/api/auth/session` name it. */
@Serializable
data class AccountUser(val id: String, val name: String)

/**
 * The document, and the revision a save must name so that it does not overwrite a change made elsewhere since.
 */
data class AccountWorkspace(val accountId: String, val revision: Int, val document: WorkspaceDocument)

@Serializable
private data class AccountWorkspaceBody(
  val lists: List<WordList>,
  val devices: List<PracticeDevice>? = null,
  val revision: Int,
  val accountId: String,
)

/**
 * Reads an answer of `/api/workspace`. An account that has saved nothing (revision 0) shows the starting lists, as in
 * the web app, and the first save keeps them.
 */
fun decodeAccountWorkspace(data: ByteArray): AccountWorkspace {
  val body = try {
    TypleJson.decodeFromString(AccountWorkspaceBody.serializer(), data.decodeToString())
  } catch (_: SerializationException) {
    throw TypleException("invalidServerData")
  } catch (_: IllegalArgumentException) {
    throw TypleException("invalidServerData")
  }
  if (body.revision < 0 || body.accountId.isEmpty()) throw TypleException("invalidServerData")
  validateLists(body.lists)
  val lists = if (body.revision == 0) initialLists() else body.lists
  return AccountWorkspace(body.accountId, body.revision, WorkspaceDocument(lists, decodeDevices(body.devices ?: emptyList())))
}

/** The body of a save (`PUT /api/workspace`): the whole document, for the revision it was changed from. */
fun encodeAccountWorkspace(workspace: AccountWorkspace): ByteArray {
  validateLists(workspace.document.lists)
  decodeDevices(workspace.document.devices)
  val body = AccountWorkspaceBody(workspace.document.lists, workspace.document.devices, workspace.revision, workspace.accountId)
  val data = TypleJson.encodeToString(AccountWorkspaceBody.serializer(), body).encodeToByteArray()
  // The server reads at most 1 MiB.
  if (data.size > MAX_WORKSPACE_BYTES) throw TypleException("workspaceTooLarge")
  return data
}

/** The backend's error keys, as messages of the app (the same as the iPad's `AccountClient.error(for:status:)`). */
fun accountError(key: String?, status: Int): TypleException = when (key) {
  "loginRequired", "loginAccountChanged" -> TypleException("accountLoginRequired")
  "loginFailed" -> TypleException("accountLoginFailed")
  "authUnavailable" -> TypleException("accountUnavailable")
  "listLimit" -> TypleException("listLimit", mapOf("max" to MAX_LISTS.toString()))
  "conflict" -> TypleException("conflict")
  "workspaceTooLarge" -> TypleException("workspaceTooLarge")
  "databaseUnavailable" -> TypleException("databaseUnavailable")
  "invalidWorkspace" -> TypleException("invalidWorkspace")
  "workspaceSaveFailed" -> TypleException("workspaceSaveFailed")
  "forbiddenRequest" -> TypleException("forbiddenRequest")
  "emptyRequest" -> TypleException("emptyRequest")
  else -> TypleException(if (status == 404) "accountNotFound" else "workspaceRequestFailed")
}

/**
 * An HTTPS address, since the token must not travel in plain text. Plain HTTP is allowed for this tablet itself, the
 * emulator's host and local network names only, as when the backend runs on a computer next to it.
 */
fun accountAddress(text: String): URI? {
  val uri = try { URI(text.trim()) } catch (_: Exception) { return null }
  val host = uri.host?.takeIf { it.isNotEmpty() } ?: return null
  if (uri.scheme == "https") return uri
  if (uri.scheme == "http" && (host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host.endsWith(".local"))) return uri
  return null
}
