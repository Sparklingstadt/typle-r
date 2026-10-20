package io.github.sparklingstadt.typle.practice

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.sparklingstadt.typle.AppModel
import io.github.sparklingstadt.typle.core.PracticeDevice
import io.github.sparklingstadt.typle.core.StoredRecord
import io.github.sparklingstadt.typle.core.TypingSession
import io.github.sparklingstadt.typle.core.WordList
import io.github.sparklingstadt.typle.core.makeRecord
import io.github.sparklingstadt.typle.core.randomId
import io.github.sparklingstadt.typle.core.typeInput
import kotlinx.coroutines.launch

enum class SaveState { IDLE, SAVING, SAVED, FAILED }

/**
 * One practice run (src/lib/usePractice.ts): the session, the device it started on and saving its record. It is a
 * ViewModel so a run survives turning the tablet.
 */
class PracticeModel : ViewModel() {
  var listId by mutableStateOf<String?>(null)
    private set
  var session by mutableStateOf(TypingSession())
    private set
  /** The device chosen when the run started; changing the choice mid-run does not change the record. */
  var practiceDevice by mutableStateOf<PracticeDevice?>(null)
    private set
  /** Whether an input method is composing text in the field. */
  var composing by mutableStateOf(false)
  var record by mutableStateOf<StoredRecord?>(null)
    private set
  var saveState by mutableStateOf(SaveState.IDLE)
    private set
  /** Changing this number focuses the field. */
  var focusRequest by mutableIntStateOf(0)
  /** The visit to the practice page this run belongs to (AppModel.practiceVisit). */
  var visit = -1

  val finished: Boolean get() = session.finishedAt != null
  val started: Boolean get() = session.startedAt != null
  val running: Boolean get() = started && !finished

  fun list(lists: List<WordList>): WordList? = lists.firstOrNull { it.id == listId } ?: lists.firstOrNull()

  fun focus() {
    focusRequest += 1
  }

  /** Starts again, on another list when given. */
  fun restart(listId: String? = null) {
    if (listId != null) this.listId = listId
    session = TypingSession()
    practiceDevice = null
    composing = false
    record = null
    saveState = SaveState.IDLE
    focus()
  }

  fun enter(value: String, list: WordList, device: PracticeDevice?, app: AppModel) {
    if (record != null) return
    val next = typeInput(session, list.words, value, System.currentTimeMillis().toDouble())
    if (session.startedAt == null && next.startedAt != null) practiceDevice = device
    listId = list.id
    session = next
    if (next.finishedAt == null) return
    val made = try { makeRecord(next, list.words.size, randomId(), practiceDevice) } catch (_: Exception) { return }
    record = made
    save(made, list.id, app)
  }

  fun retrySave(app: AppModel) {
    val record = record ?: return
    val listId = listId ?: return
    save(record, listId, app)
  }

  private fun save(record: StoredRecord, listId: String, app: AppModel) {
    saveState = SaveState.SAVING
    viewModelScope.launch {
      try {
        app.addRecord(record, listId)
        if (this@PracticeModel.record == record) saveState = SaveState.SAVED
      } catch (_: Exception) {
        if (this@PracticeModel.record == record) saveState = SaveState.FAILED
      }
    }
  }
}
