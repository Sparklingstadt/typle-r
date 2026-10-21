package io.github.sparklingstadt.typle.storage

import android.util.AtomicFile
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.TypleException
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.WorkspaceDocument
import io.github.sparklingstadt.typle.core.WorkspaceFile
import io.github.sparklingstadt.typle.core.addRecord as coreAddRecord
import io.github.sparklingstadt.typle.core.decodeWorkspaceFile
import io.github.sparklingstadt.typle.core.duplicateList as coreDuplicateList
import io.github.sparklingstadt.typle.core.encodeWorkspaceFile
import io.github.sparklingstadt.typle.core.initialLists
import io.github.sparklingstadt.typle.core.randomId
import io.github.sparklingstadt.typle.core.removeRecord
import io.github.sparklingstadt.typle.core.saveDevice as coreSaveDevice
import io.github.sparklingstadt.typle.core.saveList as coreSaveList
import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Where a workspace is kept: on this tablet, or in the account of the web app's GitHub login (`/api/workspace`). Each
 * store keeps the document it last read or wrote, and applies every change to that, so changes made while another is
 * in flight are not lost.
 */
interface WorkspaceStore {
  /** Names the data the stored device choice belongs to, like `typle-r:device:<accountId>` in the web app. */
  val accountId: String
  /** Whether the records page offers deleting a record; both stores do. */
  val canDeleteRecords: Boolean

  suspend fun load(): WorkspaceDocument
  suspend fun saveList(list: WordList, editing: Boolean): WorkspaceDocument
  suspend fun duplicateList(id: String, suffix: (Int) -> String): Pair<WorkspaceDocument, WordList>
  suspend fun deleteList(id: String): WorkspaceDocument
  suspend fun addRecord(record: StoredRecord, listId: String): WorkspaceDocument
  suspend fun deleteRecord(record: StoredRecord, listId: String): WorkspaceDocument
  suspend fun saveDevice(device: PracticeDevice, editing: Boolean, defaultName: String): WorkspaceDocument
  suspend fun deleteDevice(id: String): WorkspaceDocument
}

/**
 * The workspace in the app's files directory, in the shape of the web app's browser storage. A file that cannot be
 * read is left untouched: every change fails until it is moved away or fixed.
 */
class LocalWorkspaceStore(directory: File, override val accountId: String = "android:local") : WorkspaceStore {
  override val canDeleteRecords = true

  private val file = AtomicFile(File(directory, "workspace.json"))
  private val lock = Mutex()
  private var current: WorkspaceFile? = null

  override suspend fun load(): WorkspaceDocument = lock.withLock {
    current = null
    withContext(Dispatchers.IO) {
      if (!file.baseFile.exists()) {
        // The starting lists are shown until the first save, which keeps them.
        WorkspaceFile(accountId, 0, WorkspaceDocument(initialLists(), emptyList()))
      } else {
        try {
          decodeWorkspaceFile(file.readFully(), accountId)
        } catch (_: TypleException) {
          throw TypleException("localReadFailed")
        } catch (_: IOException) {
          throw TypleException("localReadFailed")
        }
      }
    }.also { current = it }.document
  }

  // Not cancellable: once the file is written, the copy in memory must follow it, or the next change would write the
  // old document back.
  private suspend fun change(transform: (WorkspaceDocument) -> WorkspaceDocument): WorkspaceDocument = lock.withLock {
    val before = current ?: throw TypleException("localReadFailed")
    val next = WorkspaceFile(accountId, before.revision + 1, transform(before.document))
    val data = encodeWorkspaceFile(next)
    withContext(NonCancellable + Dispatchers.IO) {
      val stream = try { file.startWrite() } catch (_: IOException) { throw TypleException("localWriteFailed") }
      try {
        stream.write(data)
        file.finishWrite(stream)
      } catch (_: IOException) {
        file.failWrite(stream)
        throw TypleException("localWriteFailed")
      }
      current = next
    }
    next.document
  }

  override suspend fun saveList(list: WordList, editing: Boolean) =
    change { it.copy(lists = coreSaveList(it.lists, list, editing)) }

  override suspend fun duplicateList(id: String, suffix: (Int) -> String): Pair<WorkspaceDocument, WordList> {
    var copy: WordList? = null
    val document = change { document ->
      val result = coreDuplicateList(document.lists, id, randomId(), suffix)
      copy = result.copy
      document.copy(lists = result.lists)
    }
    return document to copy!!
  }

  override suspend fun deleteList(id: String) = change { document -> document.copy(lists = document.lists.filter { it.id != id }) }

  override suspend fun addRecord(record: StoredRecord, listId: String) =
    change { it.copy(lists = coreAddRecord(it.lists, listId, record)) }

  override suspend fun deleteRecord(record: StoredRecord, listId: String) =
    change { it.copy(lists = removeRecord(it.lists, listId, record)) }

  override suspend fun saveDevice(device: PracticeDevice, editing: Boolean, defaultName: String) =
    change { it.copy(devices = coreSaveDevice(it.devices, device, editing, defaultName)) }

  override suspend fun deleteDevice(id: String) = change { document -> document.copy(devices = document.devices.filter { it.id != id }) }
}
