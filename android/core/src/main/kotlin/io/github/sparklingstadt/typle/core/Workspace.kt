package io.github.sparklingstadt.typle.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer

// The lists an account starts with (src/plugins/packs). They are shown until the first save, which keeps them as the
// account's own lists. The JSON files are copies; tests/android.test.cjs checks they match.
@Serializable
private data class PackList(
  val id: String? = null,
  val name: String,
  val words: List<Word>,
  val records: List<StoredRecord>? = null,
  val createdAt: String,
)

private fun pack(name: String): String =
  checkNotNull(object {}.javaClass.getResourceAsStream("/$name.json")) { "Missing bundled pack $name.json" }
    .use { it.readBytes().decodeToString() }

fun initialLists(): List<WordList> {
  val samples = TypleJson.decodeFromString(ListSerializer(PackList.serializer()), pack("samples"))
  val countries = TypleJson.decodeFromString(PackList.serializer(), pack("countries"))
  val linux = TypleJson.decodeFromString(ListSerializer(PackList.serializer()), pack("linux"))
  return samples.mapIndexed { index, list ->
    WordList(id = "sample-${index + 1}", name = list.name, words = list.words, createdAt = list.createdAt)
  } + WordList(id = countries.id ?: "countries", name = countries.name, words = countries.words,
    records = countries.records ?: emptyList(), createdAt = countries.createdAt) +
    // Each list of linux.json names its own id (tests/linux.test.cjs).
    linux.map { list ->
      WordList(id = list.id ?: list.name, name = list.name, words = list.words, records = list.records ?: emptyList(),
        createdAt = list.createdAt)
    }
}

/** The local workspace file, in the shape of the web app's browser storage (`typle-r:guest-workspace:v1`). */
@Serializable
data class WorkspaceFile(
  val version: Int = 1,
  val accountId: String,
  val revision: Int,
  val lists: List<WordList>,
  val devices: List<PracticeDevice>,
) {
  constructor(accountId: String, revision: Int, document: WorkspaceDocument) :
    this(1, accountId, revision, document.lists, document.devices)

  val document: WorkspaceDocument get() = WorkspaceDocument(lists, devices)
}

/** A saved workspace may hold up to 1 MiB of lists, like an account. */
const val MAX_WORKSPACE_BYTES = 1024 * 1024

fun decodeWorkspaceFile(data: ByteArray, accountId: String): WorkspaceFile {
  val file = try {
    TypleJson.decodeFromString(WorkspaceFile.serializer(), data.decodeToString())
  } catch (_: SerializationException) {
    throw TypleException("savedDataUnreadable")
  } catch (_: IllegalArgumentException) {
    throw TypleException("savedDataUnreadable")
  }
  if (file.version != 1 || file.accountId != accountId || file.revision < 0) throw TypleException("savedDataUnreadable")
  validateLists(file.lists)
  return file.copy(devices = decodeDevices(file.devices))
}

fun encodeWorkspaceFile(file: WorkspaceFile): ByteArray {
  validateLists(file.lists)
  decodeDevices(file.devices)
  val lists = TypleJson.encodeToString(ListSerializer(WordList.serializer()), file.lists)
  if (lists.encodeToByteArray().size > MAX_WORKSPACE_BYTES) throw TypleException("guestQuotaExceeded")
  return TypleJson.encodeToString(WorkspaceFile.serializer(), file).encodeToByteArray()
}
