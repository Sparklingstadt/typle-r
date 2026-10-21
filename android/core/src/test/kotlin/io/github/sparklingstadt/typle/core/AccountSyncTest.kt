package io.github.sparklingstadt.typle.core

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountSyncTest {
  private val servers = mutableListOf<FakeTyple>()
  private val renewals = mutableListOf<String>()

  @After fun stopServers() {
    servers.forEach { it.close() }
  }

  private fun keyOf(block: () -> Unit): String = assertThrows(TypleException::class.java) { block() }.key

  private val list = WordList("l1", "List", listOf(Word("あ", "a")), createdAt = "2024-01-01T00:00:00.000Z")
  private fun device(id: String) = PracticeDevice(id, "Device $id")
  private fun listsJson(lists: List<WordList>): String = TypleJson.encodeToString(ListSerializer(WordList.serializer()), lists)
  private fun devicesJson(devices: List<PracticeDevice>): String = TypleJson.encodeToString(ListSerializer(PracticeDevice.serializer()), devices)

  /**
   * The backend's `/api/auth/session` and `/api/workspace`: a save is taken only for the stored revision (otherwise 409),
   * and is answered with the stored workspace.
   */
  private inner class Backend(
    var accountId: String = "github:1",
    var revision: Int = 3,
    var lists: String = listsJson(listOf(list)),
    var devices: String = "[]",
    var sessionBody: String = """{"user":{"id":"github:1","name":"N"}}""",
    var alwaysConflict: Boolean = false,
  ) {
    val fake = FakeTyple().also { servers.add(it) }
    val conflicts = AtomicInteger()

    val puts: List<RecordedRequest> get() = fake.requests.filter { it.method == "PUT" }
    val gets: List<RecordedRequest> get() = fake.requests.filter { it.method == "GET" && it.path == "/api/workspace" }

    private fun answer(): String = """{"lists":$lists,"devices":$devices,"revision":$revision,"accountId":"$accountId"}"""

    init {
      fake.handle("GET", "/api/auth/session") { fake.reply(it, 200, sessionBody) }
      fake.handle("GET", "/api/workspace") { fake.reply(it, 200, answer()) }
      fake.handle("PUT", "/api/workspace") { exchange ->
        val sent = Json.parseToJsonElement(fake.requests.last { it.method == "PUT" }.text).jsonObject
        synchronized(this) {
          if (alwaysConflict || sent.getValue("revision").jsonPrimitive.int != revision) {
            conflicts.incrementAndGet()
            fake.reply(exchange, 409, """{"error":"conflict"}""")
          } else {
            lists = sent.getValue("lists").toString()
            devices = (sent["devices"] ?: JsonArray(emptyList())).toString()
            revision += 1
            fake.reply(exchange, 200, answer())
          }
        }
      }
    }

    /** The data is changed by someone else; the server thread reads the same fields under the same lock. */
    fun changeElsewhere(revision: Int, devices: List<PracticeDevice>) = synchronized(this) {
      this.revision = revision
      this.devices = devicesJson(devices)
    }

    fun sync(token: String = "old") = AccountSync(fake.baseUrl, token, "github:1") { renewals.add(it) }
  }

  @Test fun `load checks the session and renews the token`() {
    val backend = Backend(sessionBody = """{"user":{"id":"github:1","name":"N","image":null},"token":"new"}""")
    val sync = backend.sync()
    val document = sync.load()
    assertEquals(listOf("new"), renewals)
    assertEquals(listOf(list), document.lists)
    assertEquals("Bearer old", backend.fake.requests.first { it.path == "/api/auth/session" }.header("Authorization"))
    assertEquals("Bearer new", backend.gets.single().header("Authorization"))
    // Later saves use the renewed token too.
    sync.change { it }
    assertEquals("Bearer new", backend.puts.single().header("Authorization"))
  }

  @Test fun `load without a renewed token keeps the token`() {
    val backend = Backend()
    backend.sync().load()
    assertEquals(emptyList<String>(), renewals)
    assertEquals("Bearer old", backend.gets.single().header("Authorization"))
  }

  @Test fun `load refuses another account`() {
    assertEquals("accountLoginRequired", keyOf { Backend(sessionBody = """{"user":{"id":"github:2","name":"N"}}""").sync().load() })
    assertEquals("accountLoginRequired", keyOf { Backend(sessionBody = """{"user":null}""").sync().load() })
    assertEquals("accountLoginRequired", keyOf { Backend(accountId = "github:2").sync().load() })
  }

  @Test fun `load fails on an unreadable session`() {
    assertEquals("invalidServerData", keyOf { Backend(sessionBody = "[]").sync().load() })
  }

  @Test fun `change saves the whole document for its revision`() {
    val backend = Backend()
    val sync = backend.sync()
    sync.load()
    val saved = sync.change { it.copy(devices = listOf(device("d1"))) }
    val body = Json.parseToJsonElement(backend.puts.single().text).jsonObject
    assertEquals(3, body.getValue("revision").jsonPrimitive.int)
    assertEquals("github:1", body.getValue("accountId").jsonPrimitive.content)
    assertEquals(1, body.getValue("lists").jsonArray.size)
    assertEquals("Bearer old", backend.puts.single().header("Authorization"))
    assertEquals(WorkspaceDocument(listOf(list), listOf(device("d1"))), saved)
  }

  @Test fun `changes follow the revision of the last save`() {
    val backend = Backend()
    val sync = backend.sync()
    sync.load()
    sync.change { it.copy(devices = listOf(device("d1"))) }
    val saved = sync.change { it.copy(devices = it.devices + device("d2")) }
    assertEquals(listOf(3, 4), backend.puts.map { Json.parseToJsonElement(it.text).jsonObject.getValue("revision").jsonPrimitive.int })
    assertEquals(listOf(device("d1"), device("d2")), saved.devices)
    assertEquals(0, backend.conflicts.get())
  }

  @Test fun `an older answer does not replace the kept workspace`() {
    val backend = Backend()
    val sync = backend.sync()
    sync.load()
    // The save is answered with revision 2, older than the revision 3 that is kept.
    val older = """{"lists":${listsJson(listOf(list))},"devices":${devicesJson(listOf(device("older")))},"revision":2,"accountId":"github:1"}"""
    backend.fake.handle("PUT", "/api/workspace", 200, older)
    val saved = sync.change { it.copy(devices = listOf(device("mine"))) }
    assertEquals(WorkspaceDocument(listOf(list), emptyList()), saved)
    sync.change { it }
    assertEquals(
      listOf(3, 3),
      backend.puts.map { Json.parseToJsonElement(it.text).jsonObject.getValue("revision").jsonPrimitive.int },
    )
  }

  @Test fun `change before load`() {
    val backend = Backend()
    assertEquals("loadFailed", keyOf { backend.sync().change { it } })
    assertEquals(0, backend.fake.requests.size)
  }

  @Test fun `conflict is retried on the latest data`() {
    val backend = Backend()
    val sync = backend.sync()
    sync.load()
    // Changed elsewhere since the load.
    backend.changeElsewhere(5, listOf(device("other")))
    val seen = mutableListOf<List<PracticeDevice>>()
    val saved = sync.change { document ->
      seen.add(document.devices)
      document.copy(devices = document.devices + device("mine"))
    }
    assertEquals(listOf(emptyList(), listOf(device("other"))), seen)
    assertEquals(2, backend.puts.size)
    assertEquals(1, backend.conflicts.get())
    assertEquals(
      listOf(3, 5),
      backend.puts.map { Json.parseToJsonElement(it.text).jsonObject.getValue("revision").jsonPrimitive.int },
    )
    // The conflict is read again with the workspace, not the session.
    assertEquals(2, backend.gets.size)
    assertEquals(1, backend.fake.requests.count { it.path == "/api/auth/session" })
    assertEquals(listOf(device("other"), device("mine")), saved.devices)
    assertEquals(6, backend.revision)
  }

  @Test fun `three conflicts give up`() {
    val backend = Backend(alwaysConflict = true)
    val sync = backend.sync()
    sync.load()
    var transforms = 0
    assertEquals("conflict", keyOf { sync.change { transforms += 1; it } })
    assertEquals(3, AccountSync.ATTEMPTS)
    assertEquals(3, backend.puts.size)
    assertEquals(3, transforms)
    // Read again between the saves only: the load and two re-reads.
    assertEquals(3, backend.gets.size)
  }

  @Test fun `first save keeps the starting lists`() {
    val backend = Backend(revision = 0, lists = "[]")
    val sync = backend.sync()
    val loaded = sync.load()
    assertEquals(initialLists(), loaded.lists)
    sync.change { it }
    val body = Json.parseToJsonElement(backend.puts.single().text).jsonObject
    assertEquals(0, body.getValue("revision").jsonPrimitive.int)
    assertEquals(
      initialLists(),
      TypleJson.decodeFromString(ListSerializer(WordList.serializer()), body.getValue("lists").toString()),
    )
  }

  @Test fun `an error of the transform is thrown without saving`() {
    val backend = Backend()
    val sync = backend.sync()
    sync.load()
    assertEquals("nope", keyOf { sync.change { throw TypleException("nope") } })
    assertTrue(backend.puts.isEmpty())
    // And the lock is released.
    sync.change { it }
    assertEquals(1, backend.puts.size)
  }

  @Test fun `other errors of the backend are the app's messages`() {
    val backend = Backend()
    val sync = backend.sync()
    sync.load()
    backend.fake.handle("PUT", "/api/workspace", 400, """{"error":"invalidWorkspace"}""")
    assertEquals("invalidWorkspace", keyOf { sync.change { it } })
    assertEquals(1, backend.puts.size)
  }

  @Test fun `concurrent changes do not conflict with each other`() {
    val backend = Backend()
    val sync = backend.sync()
    sync.load()
    val inFirst = CountDownLatch(1)
    val overlapped = AtomicInteger()
    val active = AtomicInteger()
    val failures = mutableListOf<Throwable>()
    lateinit var second: Thread
    fun run(id: String, inside: () -> Unit) = Thread {
      try {
        sync.change { document ->
          if (active.incrementAndGet() > 1) overlapped.incrementAndGet()
          inside()
          active.decrementAndGet()
          document.copy(devices = document.devices + device(id))
        }
      } catch (e: Throwable) {
        synchronized(failures) { failures.add(e) }
      }
    }
    val first = run("a") {
      inFirst.countDown()
      // Hold the first change until the second is waiting for it (or, without the lock, has run past it).
      val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
      while ((second.state == Thread.State.NEW || second.state == Thread.State.RUNNABLE) && System.nanoTime() < deadline) Thread.onSpinWait()
    }
    second = run("b") {}
    first.start()
    assertTrue(inFirst.await(5, TimeUnit.SECONDS))
    second.start()
    first.join(10_000)
    second.join(10_000)
    assertEquals(emptyList<Throwable>(), failures)
    assertEquals(0, overlapped.get())
    assertEquals(0, backend.conflicts.get())
    assertEquals(2, backend.puts.size)
    assertEquals(setOf("a", "b"), Json.parseToJsonElement(backend.devices).jsonArray.map { it.jsonObject.getValue("id").jsonPrimitive.content }.toSet())
    assertEquals(5, backend.revision)
    assertFalse(first.isAlive || second.isAlive)
  }
}
