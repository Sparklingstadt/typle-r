package io.github.sparklingstadt.typle.storage

import io.github.sparklingstadt.typle.core.AccountSync
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.WorkspaceDocument
import io.github.sparklingstadt.typle.core.addRecord as coreAddRecord
import io.github.sparklingstadt.typle.core.duplicateList as coreDuplicateList
import io.github.sparklingstadt.typle.core.randomId
import io.github.sparklingstadt.typle.core.removeRecord
import io.github.sparklingstadt.typle.core.saveDevice as coreSaveDevice
import io.github.sparklingstadt.typle.core.saveList as coreSaveList
import java.net.URI
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The signed-in account's workspace through the web app's `/api/workspace`, the same data the web app shows after a
 * GitHub login (ios/Typle/Storage/AccountWorkspaceStore.swift). Every change is a save of the whole document for the
 * revision it was made from; after a conflict [AccountSync] reads the latest and makes the change again on it.
 */
class AccountWorkspaceStore(baseUrl: URI, token: String, override val accountId: String, renewed: (String) -> Unit) : WorkspaceStore {
  override val canDeleteRecords = true

  private val sync = AccountSync(baseUrl, token, accountId, renewed)

  override suspend fun load(): WorkspaceDocument = withContext(Dispatchers.IO) { sync.load() }

  private suspend fun change(transform: (WorkspaceDocument) -> WorkspaceDocument): WorkspaceDocument =
    withContext(Dispatchers.IO) { sync.change(transform) }

  override suspend fun saveList(list: WordList, editing: Boolean) =
    change { it.copy(lists = coreSaveList(it.lists, list, editing)) }

  override suspend fun duplicateList(id: String, suffix: (Int) -> String): Pair<WorkspaceDocument, WordList> {
    // The same id on every attempt, so the copy returned is the one that was saved.
    val copyId = randomId()
    var copy: WordList? = null
    val document = change { document ->
      val result = coreDuplicateList(document.lists, id, copyId, suffix)
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
