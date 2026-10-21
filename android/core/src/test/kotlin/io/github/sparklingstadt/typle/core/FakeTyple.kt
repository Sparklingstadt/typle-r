package io.github.sparklingstadt.typle.core

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/** A request the fake server received. `target` is the path with its query, `path` is the path alone. */
class RecordedRequest(val method: String, val target: String, val headers: Map<String, String>, val body: ByteArray) {
  val path: String get() = target.substringBefore('?')
  val query: String get() = target.substringAfter('?', "")
  val text: String get() = body.decodeToString()

  /** The first value of a header, whatever its case. */
  fun header(name: String): String? = headers[name.lowercase()]
}

/**
 * A stand-in for the Typle backend on 127.0.0.1 and a free port. Answers are registered per method and path and can be
 * replaced between calls; requests without one get an empty 404. Close it after the test.
 */
class FakeTyple : AutoCloseable {
  private val server = HttpServer.create(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 0)
  private val handlers = ConcurrentHashMap<String, (HttpExchange) -> Unit>()
  private val log = CopyOnWriteArrayList<RecordedRequest>()

  /** Every request so far, oldest first. */
  val requests: List<RecordedRequest> get() = log.toList()

  val baseUrl: URI get() = URI("http://127.0.0.1:${server.address.port}/")

  init {
    server.createContext("/") { exchange ->
      exchange.use {
        val body = exchange.requestBody.readBytes()
        val headers = exchange.requestHeaders.entries.associate { it.key.lowercase() to it.value.first() }
        log.add(RecordedRequest(exchange.requestMethod, exchange.requestURI.toString(), headers, body))
        val handler = handlers["${exchange.requestMethod} ${exchange.requestURI.path}"]
        if (handler != null) handler(exchange) else reply(exchange, 404)
      }
    }
    server.start()
  }

  /** Answers `method path` with [handler] from now on, replacing an earlier answer. */
  fun handle(method: String, path: String, handler: (HttpExchange) -> Unit) {
    handlers["$method $path"] = handler
  }

  /** Answers `method path` with a fixed status and body. */
  fun handle(method: String, path: String, status: Int, body: String = "") {
    handle(method, path) { reply(it, status, body) }
  }

  fun reply(exchange: HttpExchange, status: Int, body: String = "") {
    if (body.isEmpty()) {
      exchange.sendResponseHeaders(status, -1)
    } else {
      exchange.responseHeaders.add("Content-Type", "application/json")
      val bytes = body.encodeToByteArray()
      exchange.sendResponseHeaders(status, bytes.size.toLong())
      exchange.responseBody.write(bytes)
    }
  }

  override fun close() {
    server.stop(0)
  }
}
