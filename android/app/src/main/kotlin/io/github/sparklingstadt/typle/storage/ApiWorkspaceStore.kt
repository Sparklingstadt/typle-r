package io.github.sparklingstadt.typle.storage

import io.github.sparklingstadt.typle.core.MAX_DEVICES
import io.github.sparklingstadt.typle.core.MAX_DEVICE_LAYOUT
import io.github.sparklingstadt.typle.core.MAX_DEVICE_NAME
import io.github.sparklingstadt.typle.core.MAX_LISTS
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.TypleException
import io.github.sparklingstadt.typle.core.TypleJson
import io.github.sparklingstadt.typle.core.Word
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.WorkspaceDocument
import io.github.sparklingstadt.typle.core.randomId
import io.github.sparklingstadt.typle.core.addRecord as coreAddRecord
import io.github.sparklingstadt.typle.core.duplicateList as coreDuplicateList
import io.github.sparklingstadt.typle.core.saveDevice as coreSaveDevice
import io.github.sparklingstadt.typle.core.saveList as coreSaveList
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable

/**
 * An account's cloud workspace through the Go API (docs/api.md), started with `-writable` behind HTTPS. The API
 * authenticates with the GitHub token and reads or writes only that user's data.
 */
class ApiWorkspaceStore(private val baseUrl: URI, private val token: String) : WorkspaceStore {
  override val accountId = "api:${baseUrl.host ?: baseUrl}"
  override val canDeleteRecords = false

  private var document: WorkspaceDocument? = null

  @Serializable private data class Summary(val id: String)
  @Serializable private data class ListSummaries(val lists: List<Summary>)
  @Serializable private data class ApiList(val id: String, val name: String, val createdAt: String, val words: List<Word>)
  @Serializable private data class ListBody(val list: ApiList)
  @Serializable private data class Records(val records: List<StoredRecord>)
  @Serializable private data class Devices(val devices: List<PracticeDevice>)
  @Serializable private data class DeviceBody(val device: PracticeDevice)
  @Serializable private data class RecordBody(val record: StoredRecord)
  @Serializable private data class ErrorBody(val error: String)
  @Serializable private data class ListRequest(val name: String, val words: List<Word>)
  @Serializable private data class DeviceRequest(val name: String, val layout: String)
  @Serializable private data class RecordRequest(
    val id: String? = null,
    val time: Double,
    val date: String,
    val mistakes: Int,
    val accuracy: Double,
    val wordCount: Int? = null,
    val deviceId: String? = null,
  )

  // Reading

  override suspend fun load(): WorkspaceDocument = coroutineScope {
    val devices = get("devices", Devices.serializer())
    val summaries = get("lists", ListSummaries.serializer())
    val lists = summaries.lists.map { async { fetchList(it.id) } }.awaitAll()
    WorkspaceDocument(lists, devices.devices).also { document = it }
  }

  private suspend fun fetchList(id: String): WordList {
    val body = get("lists/${encode(id)}", ListBody.serializer())
    // The API returns at most 1000 records, newest first; the app keeps them oldest first, as they were saved.
    val records = get("lists/${encode(id)}/records?limit=1000", Records.serializer())
    return WordList(body.list.id, body.list.name, body.list.words, records.records.reversed(), body.list.createdAt)
  }

  // Writing

  private fun current(): WorkspaceDocument = document ?: throw TypleException("loadFailed")

  override suspend fun saveList(list: WordList, editing: Boolean): WorkspaceDocument {
    // Checked here first, so mistakes are explained without a request and in the reader's language.
    coreSaveList(current().lists, list, editing)
    val request = TypleJson.encodeToString(ListRequest.serializer(), ListRequest(list.name.trim(), list.words))
    val saved = if (editing) send("PATCH", "lists/${encode(list.id)}", request, ListBody.serializer()).list
    else send("POST", "lists", request, ListBody.serializer()).list
    val before = current()
    val next = if (before.lists.any { it.id == saved.id }) {
      before.copy(lists = before.lists.map { if (it.id == saved.id) it.copy(name = saved.name, words = saved.words) else it })
    } else {
      before.copy(lists = before.lists + WordList(saved.id, saved.name, saved.words, emptyList(), saved.createdAt))
    }
    document = next
    return next
  }

  override suspend fun duplicateList(id: String, suffix: (Int) -> String): Pair<WorkspaceDocument, WordList> {
    val copy = coreDuplicateList(current().lists, id, randomId(), suffix).copy
    val next = saveList(copy, editing = false)
    return next to (next.lists.lastOrNull() ?: copy)
  }

  override suspend fun deleteList(id: String): WorkspaceDocument {
    sendWithoutBody("DELETE", "lists/${encode(id)}")
    val next = current().let { it.copy(lists = it.lists.filter { list -> list.id != id }) }
    document = next
    return next
  }

  override suspend fun addRecord(record: StoredRecord, listId: String): WorkspaceDocument {
    // The record keeps its id, so sending it again after a failure does not add it twice.
    val request = RecordRequest(record.id, record.time, record.date, record.mistakes ?: 0, record.accuracy ?: 100.0,
      record.wordCount, record.device?.id)
    val body = send("POST", "lists/${encode(listId)}/records", TypleJson.encodeToString(RecordRequest.serializer(), request), RecordBody.serializer())
    val next = current().let { it.copy(lists = coreAddRecord(it.lists, listId, body.record)) }
    document = next
    return next
  }

  override suspend fun deleteRecord(record: StoredRecord, listId: String): WorkspaceDocument = throw TypleException("apiUnsupported")

  override suspend fun saveDevice(device: PracticeDevice, editing: Boolean, defaultName: String): WorkspaceDocument {
    coreSaveDevice(current().devices, device, editing, defaultName)
    val request = TypleJson.encodeToString(DeviceRequest.serializer(), DeviceRequest(device.name.trim(), device.layout.trim()))
    val saved = if (editing) send("PATCH", "devices/${encode(device.id)}", request, DeviceBody.serializer()).device
    else send("POST", "devices", request, DeviceBody.serializer()).device
    val before = current()
    val next = before.copy(devices = if (before.devices.any { it.id == saved.id }) before.devices.map { if (it.id == saved.id) saved else it }
    else before.devices + saved)
    document = next
    return next
  }

  override suspend fun deleteDevice(id: String): WorkspaceDocument {
    sendWithoutBody("DELETE", "devices/${encode(id)}")
    val next = current().let { it.copy(devices = it.devices.filter { device -> device.id != id }) }
    document = next
    return next
  }

  // HTTP

  private fun encode(segment: String) = URLEncoder.encode(segment, "UTF-8").replace("+", "%20")

  private fun url(path: String): URL = URL(baseUrl.toString().trimEnd('/') + "/api/v1/" + path)

  private suspend fun <T> get(path: String, serializer: KSerializer<T>): T = decode(perform("GET", path, null), serializer)

  private suspend fun <T> send(method: String, path: String, body: String, serializer: KSerializer<T>): T =
    decode(perform(method, path, body), serializer)

  private suspend fun sendWithoutBody(method: String, path: String) {
    perform(method, path, null)
  }

  private fun <T> decode(text: String, serializer: KSerializer<T>): T = try {
    TypleJson.decodeFromString(serializer, text)
  } catch (_: SerializationException) {
    throw TypleException("invalidServerData")
  } catch (_: IllegalArgumentException) {
    throw TypleException("invalidServerData")
  }

  private suspend fun perform(method: String, path: String, body: String?): String = withContext(Dispatchers.IO) {
    val connection = try { url(path).openConnection() as HttpURLConnection } catch (_: IOException) { throw TypleException("apiUnreachable") }
    try {
      // Android's HttpURLConnection accepts PATCH, unlike the JDK's.
      try { connection.requestMethod = method } catch (_: java.net.ProtocolException) { throw TypleException("apiUnreachable") }
      connection.connectTimeout = 30_000
      connection.readTimeout = 30_000
      connection.useCaches = false
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Accept", "application/json")
      if (body != null) {
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.outputStream.use { it.write(body.encodeToByteArray()) }
      }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val text = stream?.use { it.readBytes().decodeToString() } ?: ""
      if (status !in 200..299) {
        val key = try { TypleJson.decodeFromString(ErrorBody.serializer(), text).error } catch (_: Exception) { null }
        throw error(key, status)
      }
      text
    } catch (e: TypleException) {
      throw e
    } catch (_: IOException) {
      throw TypleException("apiUnreachable")
    } finally {
      connection.disconnect()
    }
  }

  companion object {
    /**
     * An HTTPS address, since the token must not travel in plain text. Plain HTTP is allowed for this tablet itself,
     * the emulator's host and local network names only, as when the API runs on a computer next to it.
     */
    fun apiUrl(text: String): URI? {
      val uri = try { URI(text.trim()) } catch (_: Exception) { return null }
      val host = uri.host?.takeIf { it.isNotEmpty() } ?: return null
      if (uri.scheme == "https") return uri
      if (uri.scheme == "http" && (host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host.endsWith(".local"))) return uri
      return null
    }

    /** The API's error keys, as messages of the app. Keys the API shares with the web app keep their message. */
    fun error(key: String?, status: Int): TypleException = when (key) {
      "invalidToken" -> TypleException("apiInvalidToken")
      "methodNotAllowed" -> TypleException("apiReadOnly")
      "githubUnavailable" -> TypleException("apiGithubUnavailable")
      "listNotFound" -> TypleException("listDeleted")
      "listLimit" -> TypleException("listLimit", mapOf("max" to MAX_LISTS.toString()))
      "requestTooLarge", "workspaceTooLarge" -> TypleException("workspaceTooLarge")
      "listNameRequired", "listNameDuplicate", "wordsRequired", "wordFieldsRequired", "databaseUnavailable", "deviceNameRequired" ->
        TypleException(key)
      "deviceNameTooLong" -> TypleException(key, mapOf("max" to MAX_DEVICE_NAME.toString()))
      "deviceLayoutTooLong" -> TypleException(key, mapOf("max" to MAX_DEVICE_LAYOUT.toString()))
      "deviceLimit" -> TypleException(key, mapOf("max" to MAX_DEVICES.toString()))
      "deviceNotFound" -> TypleException(if (status == 404) "deviceDeleted" else "apiRejected")
      "invalidList", "invalidRecord", "recordLimit", "invalidDevice", "deviceNameDuplicate" -> TypleException("apiRejected")
      else -> TypleException(if (status == 404) "apiNotFound" else "workspaceRequestFailed")
    }
  }
}
