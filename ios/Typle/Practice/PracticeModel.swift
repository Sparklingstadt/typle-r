import Foundation
import Observation
import TypleCore

enum SaveState {
  case idle, saving, saved, failed
}

/// One practice run (src/lib/usePractice.ts): the session, the device it started on and saving its record.
@MainActor
@Observable
final class PracticeModel {
  private(set) var listId: String? = nil
  private(set) var session = TypingSession()
  /// The device chosen when the run started; changing the choice mid-run does not change the record.
  private(set) var practiceDevice: PracticeDevice? = nil
  /// Whether an input method is composing text in the field.
  private(set) var composing = false
  private(set) var record: StoredRecord? = nil
  private(set) var saveState = SaveState.idle
  var focusRequest = 0

  var finished: Bool { session.finishedAt != nil }
  var started: Bool { session.startedAt != nil }
  var running: Bool { started && !finished }

  func list(in lists: [WordList]) -> WordList? {
    lists.first { $0.id == listId } ?? lists.first
  }

  /// Starts again, on another list when given.
  func restart(listId: String? = nil) {
    if let listId { self.listId = listId }
    session = TypingSession()
    practiceDevice = nil
    composing = false
    record = nil
    saveState = .idle
    focusRequest += 1
  }

  /// Shows the list without starting a run, keeping a run already in progress on it.
  func select(_ id: String?) {
    if id != listId { listId = id }
  }

  func setComposing(_ value: Bool) { composing = value }

  func enter(_ value: String, list: WordList, device: PracticeDevice?, app: AppModel) {
    guard record == nil else { return }
    let now = (Date().timeIntervalSince1970 * 1000).rounded()
    let next = typeInput(session, words: list.words, value: value, now: now)
    if session.startedAt == nil && next.startedAt != nil { practiceDevice = device }
    listId = list.id
    session = next
    guard next.finishedAt != nil, let record = try? makeRecord(next, wordCount: list.words.count, id: randomId(), device: practiceDevice) else { return }
    self.record = record
    save(record, listId: list.id, app: app)
  }

  func retrySave(app: AppModel) {
    guard let record, let listId else { return }
    save(record, listId: listId, app: app)
  }

  private func save(_ record: StoredRecord, listId: String, app: AppModel) {
    saveState = .saving
    Task {
      do {
        try await app.addRecord(record, listId: listId)
        if self.record == record { saveState = .saved }
      } catch {
        if self.record == record { saveState = .failed }
      }
    }
  }
}
