package io.github.sparklingstadt.typle.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class AccountWorkspaceTest {
  private val list = WordList(id = "1", name = "A", words = listOf(Word(display = "a", input = "a")), createdAt = "2026-01-01")
  private val device = PracticeDevice(id = "d", name = "Tab", layout = "qwerty")
  private val listJson = """{"id":"1","name":"A","createdAt":"2026-01-01","words":[{"display":"a","input":"a","annotation":""}],"records":[]}"""

  private fun keyOf(block: () -> Unit): String = assertThrows(TypleException::class.java) { block() }.key

  @Test fun decodesASavedWorkspace() {
    val body = """{"lists":[$listJson],"devices":[{"id":"d","name":"Tab","layout":"qwerty"}],"revision":3,"accountId":"github:1","extra":1}"""
    val workspace = decodeAccountWorkspace(body.toByteArray())
    assertEquals(3, workspace.revision)
    assertEquals("github:1", workspace.accountId)
    assertEquals(listOf(list), workspace.document.lists)
    assertEquals(listOf(device), workspace.document.devices)
  }

  @Test fun showsTheStartingListsBeforeTheFirstSave() {
    val workspace = decodeAccountWorkspace("""{"lists":[],"revision":0,"accountId":"github:1"}""".toByteArray())
    assertEquals(0, workspace.revision)
    assertEquals(initialLists(), workspace.document.lists)
    assertEquals(emptyList<PracticeDevice>(), workspace.document.devices)
  }

  @Test fun rejectsWhatIsNotAWorkspace() {
    val bodies = listOf(
      """{"lists":[],"revision":-1,"accountId":"github:1"}""",
      """{"lists":[],"revision":1,"accountId":""}""",
      "not json",
      """{"revision":1,"accountId":"github:1"}""",
    )
    for (body in bodies) assertEquals(body, "invalidServerData", keyOf { decodeAccountWorkspace(body.toByteArray()) })
  }

  @Test fun encodesTheWholeDocumentWithItsRevision() {
    val workspace = AccountWorkspace("github:1", 4, WorkspaceDocument(listOf(list), listOf(device)))
    val data = encodeAccountWorkspace(workspace)
    val json = Json.parseToJsonElement(data.decodeToString()).jsonObject
    assertEquals(setOf("lists", "devices", "revision", "accountId"), json.keys)
    assertEquals(4, json.getValue("revision").jsonPrimitive.int)
    assertEquals("github:1", json.getValue("accountId").jsonPrimitive.content)
    assertEquals(workspace, decodeAccountWorkspace(data))
  }

  @Test fun refusesToSendMoreThanOneMebibyte() {
    val words = List(MAX_WORDS) { Word(display = "d".repeat(MAX_WORD_FIELD), input = "i".repeat(MAX_WORD_FIELD)) }
    val workspace = AccountWorkspace("github:1", 1, WorkspaceDocument(listOf(list.copy(words = words)), emptyList()))
    assertEquals("workspaceTooLarge", keyOf { encodeAccountWorkspace(workspace) })
  }

  @Test fun mapsTheBackendsErrors() {
    for (key in listOf("loginRequired", "loginAccountChanged")) assertEquals(TypleException("accountLoginRequired"), accountError(key, 401))
    assertEquals(TypleException("accountLoginFailed"), accountError("loginFailed", 401))
    assertEquals(TypleException("accountUnavailable"), accountError("authUnavailable", 503))
    assertEquals(TypleException("listLimit", mapOf("max" to MAX_LISTS.toString())), accountError("listLimit", 400))
    for (key in listOf("conflict", "workspaceTooLarge", "databaseUnavailable", "invalidWorkspace", "workspaceSaveFailed",
      "forbiddenRequest", "emptyRequest")) assertEquals(TypleException(key), accountError(key, 400))
    assertEquals(TypleException("accountNotFound"), accountError(null, 404))
    assertEquals(TypleException("workspaceRequestFailed"), accountError("x", 500))
    assertEquals(TypleException("workspaceRequestFailed"), accountError(null, 500))
  }

  @Test fun acceptsHttpsAndLocalHttpOnly() {
    assertEquals(DEFAULT_ACCOUNT_URL, accountAddress(DEFAULT_ACCOUNT_URL)?.toString())
    assertNotNull(accountAddress(" https://x.example/ "))
    assertEquals("x.example", accountAddress(" https://x.example/ ")?.host)
    for (url in listOf("http://10.0.2.2:8081", "http://localhost:8081", "http://mac.local:8081", "http://127.0.0.1:8081")) {
      assertNotNull(url, accountAddress(url))
    }
    for (url in listOf("http://example.com", "ftp://x", "typle", "")) assertNull(url, accountAddress(url))
  }
}
