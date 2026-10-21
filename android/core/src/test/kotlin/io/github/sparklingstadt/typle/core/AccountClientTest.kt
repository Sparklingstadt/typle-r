package io.github.sparklingstadt.typle.core

import java.net.ServerSocket
import java.net.URI
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountClientTest {
  private val servers = mutableListOf<FakeTyple>()

  private fun fake(): FakeTyple = FakeTyple().also { servers.add(it) }

  @After fun stopServers() {
    servers.forEach { it.close() }
  }

  private fun keyOf(block: () -> Unit): String = assertThrows(TypleException::class.java) { block() }.key

  @Test fun `challenge follows RFC 7636`() {
    assertEquals(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      AccountLogin.challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    )
  }

  @Test fun `verifiers are 43 url-safe characters and differ`() {
    val first = AccountLogin.newVerifier()
    val second = AccountLogin.newVerifier()
    assertTrue(Regex("^[A-Za-z0-9_-]{43}$").matches(first))
    assertTrue(Regex("^[A-Za-z0-9_-]{43}$").matches(second))
    assertNotEquals(first, second)
  }

  @Test fun `signin url names the android client`() {
    val v = AccountLogin.newVerifier()
    assertEquals(
      "https://t.example/api/auth/signin?client=android&code_challenge=${AccountLogin.challengeOf(v)}",
      AccountLogin(URI("https://t.example/"), v).signinUrl.toString(),
    )
  }

  @Test fun `url joins base and path with or without a trailing slash`() {
    assertEquals("https://t.example/api/workspace", AccountClient(URI("https://t.example")).url("api/workspace").toString())
    assertEquals("https://t.example/api/workspace", AccountClient(URI("https://t.example/")).url("api/workspace").toString())
    assertEquals("https://t.example/app/api/x?a=b%20c&d=%26", AccountClient(URI("https://t.example/app/")).url("api/x", listOf("a" to "b c", "d" to "&")).toString())
  }

  @Test fun `sends bearer token and json`() {
    val fake = fake()
    fake.handle("GET", "/api/workspace", 200, """{"ok":true}""")
    fake.handle("PUT", "/api/workspace", 200, "{}")
    val client = AccountClient(fake.baseUrl)

    assertArrayEquals("""{"ok":true}""".toByteArray(), client.send("GET", "api/workspace", token = "t"))
    val get = fake.requests.single()
    assertEquals("GET", get.method)
    assertEquals("Bearer t", get.header("Authorization"))
    assertEquals("application/json", get.header("Accept"))
    assertNull(get.header("Content-Type"))

    client.send("PUT", "api/workspace", "[1]".toByteArray(), "t")
    val put = fake.requests.last()
    assertEquals("PUT", put.method)
    assertEquals("application/json", put.header("Content-Type"))
    assertEquals("[1]", put.text)
  }

  @Test fun `sends no authorization without a token`() {
    val fake = fake()
    fake.handle("GET", "/x", 200, "{}")
    AccountClient(fake.baseUrl).send("GET", "x")
    assertNull(fake.requests.single().header("Authorization"))
  }

  @Test fun `maps error answers`() {
    val fake = fake()
    val client = AccountClient(fake.baseUrl)
    fake.handle("GET", "/api/a", 409, """{"error":"conflict"}""")
    fake.handle("GET", "/api/b", 404)
    fake.handle("GET", "/api/c", 500, """{"error":"x"}""")
    fake.handle("GET", "/api/d", 401, """{"error":"loginRequired"}""")
    fake.handle("GET", "/api/e", 502, "<html>bad gateway</html>")
    assertEquals("conflict", keyOf { client.send("GET", "api/a") })
    assertEquals("accountNotFound", keyOf { client.send("GET", "api/b") })
    assertEquals("workspaceRequestFailed", keyOf { client.send("GET", "api/c") })
    assertEquals("accountLoginRequired", keyOf { client.send("GET", "api/d") })
    assertEquals("workspaceRequestFailed", keyOf { client.send("GET", "api/e") })
  }

  @Test fun `unreachable server`() {
    val port = ServerSocket(0).use { it.localPort }
    val client = AccountClient(URI("http://127.0.0.1:$port/"))
    assertEquals("accountUnreachable", keyOf { client.send("GET", "api/workspace") })
  }

  @Test fun `finish trades the code`() {
    val fake = fake()
    fake.handle("POST", "/api/auth/token", 200, """{"token":"tok","user":{"id":"github:1","name":"N","image":null}}""")
    val login = AccountLogin(fake.baseUrl, "v".repeat(43))

    val (token, user) = login.finish("typle-r://login?code=c")

    assertEquals("tok", token)
    assertEquals(AccountUser("github:1", "N"), user)
    val request = fake.requests.single()
    assertEquals("POST", request.method)
    assertEquals("""{"code":"c","verifier":"${"v".repeat(43)}"}""", request.text)
    assertNull(request.header("Authorization"))
  }

  @Test fun `finish decodes the code from the query`() {
    val fake = fake()
    fake.handle("POST", "/api/auth/token", 200, """{"token":"tok","user":{"id":"github:1","name":"N"}}""")
    AccountLogin(fake.baseUrl, "v").finish("typle-r://login?x=1&code=a%2Bb%3D")
    assertEquals("""{"code":"a+b=","verifier":"v"}""", fake.requests.single().text)
  }

  @Test fun `finish passes on the server's refusal`() {
    val fake = fake()
    fake.handle("POST", "/api/auth/token", 401, """{"error":"loginFailed"}""")
    assertEquals("accountLoginFailed", keyOf { AccountLogin(fake.baseUrl, "v").finish("typle-r://login?code=c") })
  }

  @Test fun `finish rejects an answer without a token`() {
    val fake = fake()
    fake.handle("POST", "/api/auth/token", 200, """{"user":{"id":"github:1","name":"N"}}""")
    assertEquals("invalidServerData", keyOf { AccountLogin(fake.baseUrl, "v").finish("typle-r://login?code=c") })
  }

  @Test fun `finish refuses other urls`() {
    val fake = fake()
    fake.handle("POST", "/api/auth/token", 200, """{"token":"tok","user":{"id":"github:1","name":"N"}}""")
    val login = AccountLogin(fake.baseUrl, "v")
    for (callback in listOf(
      "typle-r://login?error=loginFailed",
      "typle-r://login",
      "typle-r://login?code=",
      "https://x/login?code=c",
      "typle-r://other?code=c",
      "not a url",
    )) {
      assertEquals(callback, "accountLoginFailed", keyOf { login.finish(callback) })
    }
    assertTrue(fake.requests.isEmpty())
  }
}
