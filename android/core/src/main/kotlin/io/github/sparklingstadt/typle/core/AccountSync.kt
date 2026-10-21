package io.github.sparklingstadt.typle.core

import java.net.URI
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

// The signed-in account's workspace through the web app's `/api/workspace`. Mirrors
// ios/Typle/Storage/AccountWorkspaceStore.swift (`load()` and `change(_:)`).

@Serializable
private data class SessionAnswer(val user: AccountUser? = null, val token: String? = null)

/**
 * Loads and saves the account's workspace, the same data the web app shows after a GitHub login. Every change is a save
 * of the whole document for the revision it was made from; when the data was changed elsewhere since (409 conflict), the
 * latest is read and the change made again on it. Blocking: call it off the main thread. Calls run one at a time, so the
 * app's own changes never conflict with each other.
 */
class AccountSync(
  baseUrl: URI,
  private var token: String,
  val accountId: String,
  /** Keeps a token the backend renewed. */
  private val renewed: (String) -> Unit,
) {
  private val client = AccountClient(baseUrl)
  private val lock = ReentrantLock()
  private var saved: AccountWorkspace? = null

  /** Checks the session and reads the workspace; every change after it is made on what this returns. */
  fun load(): WorkspaceDocument = lock.withLock {
    // The session renews a token that has grown old, so a user who practises keeps signed in.
    val answer = try {
      TypleJson.decodeFromString(SessionAnswer.serializer(), client.send("GET", "api/auth/session", token = token).decodeToString())
    } catch (_: SerializationException) {
      throw TypleException("invalidServerData")
    } catch (_: IllegalArgumentException) {
      throw TypleException("invalidServerData")
    }
    if (answer.user?.id != accountId) throw TypleException("accountLoginRequired")
    answer.token?.let {
      token = it
      renewed(it)
    }
    val loaded = read()
    saved = loaded
    loaded.document
  }

  private fun read(): AccountWorkspace {
    val loaded = decodeAccountWorkspace(client.send("GET", "api/workspace", token = token))
    if (loaded.accountId != accountId) throw TypleException("accountLoginRequired")
    return loaded
  }

  /**
   * Saves what [transform] makes of the document and returns the document the backend kept. After a conflict the latest
   * data is read and [transform] runs again on it, [ATTEMPTS] times in all.
   */
  fun change(transform: (WorkspaceDocument) -> WorkspaceDocument): WorkspaceDocument = lock.withLock {
    var current = saved ?: throw TypleException("loadFailed")
    for (attempt in 1..ATTEMPTS) {
      val next = current.copy(document = transform(current.document))
      try {
        val written = decodeAccountWorkspace(client.send("PUT", "api/workspace", encodeAccountWorkspace(next), token))
        // The newer revision is kept.
        val kept = saved?.takeIf { it.revision >= written.revision } ?: written
        saved = kept
        return@withLock kept.document
      } catch (e: TypleException) {
        if (e.key != "conflict" || attempt == ATTEMPTS) throw e
        current = read()
        saved = current
      }
    }
    throw TypleException("conflict")
  }

  companion object {
    /** How many times a change is saved in all when others change the data meanwhile. */
    const val ATTEMPTS = 3
  }
}
