import Foundation
import XCTest
@testable import TypleCore

// The same cases as tests/*.test.cjs for src/core, so both apps judge and rank runs alike.
final class TypingTests: XCTestCase {
  func testMistakesRequireCorrectionAndFinishOnce() {
    let words = [Word(display: "ab", input: "ab"), Word(display: "c", input: "c")]
    var s = typeInput(TypingSession(), words: words, value: "x", now: 1000)
    XCTAssertEqual(s.index, 0)
    XCTAssertEqual(s.mistakes, 1)
    s = typeInput(s, words: words, value: "", now: 1100)
    s = typeInput(s, words: words, value: "ab", now: 2000)
    XCTAssertEqual(s.index, 1)
    XCTAssertEqual(s.input, "")
    s = typeInput(s, words: words, value: "c", now: 3000)
    XCTAssertEqual(sessionResult(s), SessionResult(time: 2, mistakes: 1, accuracy: 75))
    XCTAssertEqual(typeInput(s, words: words, value: "c", now: 4000), s)
  }

  func testEmptyListsAndUnicode() {
    XCTAssertEqual(typeInput(TypingSession(), words: [], value: "a", now: 0), TypingSession())
    XCTAssertEqual(typeInput(TypingSession(), words: [Word(display: "x", input: "あ😀")], value: "あ😀", now: 0).attempts, 2)
    // Composed and decomposed forms are different characters to type, as in JavaScript.
    let decomposed = typeInput(TypingSession(), words: [Word(display: "é", input: "e\u{301}")], value: "\u{e9}", now: 0)
    XCTAssertNil(decomposed.finishedAt)
    XCTAssertEqual(decomposed.mistakes, 1)
  }

  func testCompareInput() {
    XCTAssertEqual(compareInput(target: "hoge", typed: "").states, [.current, .pending, .pending, .pending])
    XCTAssertEqual(compareInput(target: "hoge", typed: "ho").states, [.done, .done, .current, .pending])
    let typo = compareInput(target: "hoge", typed: "hoxe")
    XCTAssertEqual(typo.states, [.done, .done, .error, .error])
    XCTAssertEqual(typo.errorIndex, 2)
    XCTAssertEqual(compareInput(target: "hoge", typed: "hx").states, [.done, .error, .currentError, .pending])
    let extra = compareInput(target: "ab", typed: "abc")
    XCTAssertEqual(extra.states, [.done, .done])
    XCTAssertEqual(extra.extra, ["c"])
    XCTAssertEqual(extra.errorIndex, 2)
    XCTAssertEqual(compareInput(target: "あ😀", typed: "あ😀").states, [.done, .done])
    XCTAssertNil(compareInput(target: "あ😀", typed: "あ😀").errorIndex)
  }

  func testTypingSpeed() {
    var s = TypingSession()
    s.startedAt = 1000
    s.attempts = 12
    s.mistakes = 2
    var notStarted = s
    notStarted.startedAt = nil
    XCTAssertNil(typingSpeed(notStarted, now: 5000))
    XCTAssertNil(typingSpeed(s, now: 1500))
    XCTAssertEqual(typingSpeed(s, now: 3000), 300)
    s.finishedAt = 31000
    XCTAssertEqual(typingSpeed(s, now: 99999), 20)
  }
}

final class RecordTests: XCTestCase {
  func testRecordOrderingAndDeletion() throws {
    let legacy = StoredRecord(time: 1, date: "2026-01-01")
    let slow = StoredRecord(id: "slow", time: 5, date: "2026-01-02", accuracy: 100)
    let fast = StoredRecord(id: "fast", time: 2, date: "2026-01-03", accuracy: 100)
    let records = [legacy, slow, fast]
    XCTAssertEqual(bestRecords(records), [fast, slow, legacy])
    XCTAssertEqual(bestRecords(records, order: .speed), [legacy, fast, slow])
    let lists = [WordList(id: "a", name: "A", words: [Word(display: "a", input: "a")], records: records, createdAt: "2026-01-01"),
                 WordList(id: "b", name: "B", words: [Word(display: "b", input: "b")], records: [legacy], createdAt: "2026-01-01")]
    XCTAssertEqual(recordRows(lists).first?.record, fast)
    XCTAssertEqual(removeRecord(lists, listId: "a", record: legacy)[0].records, [slow, fast])
    XCTAssertEqual(removeRecord(lists, listId: "a", record: fast)[0].records, [legacy, slow])
    XCTAssertEqual(removeRecord(lists, listId: "a", record: fast)[1], lists[1])
  }

  func testMakeAndAddRecordOnce() throws {
    var session = TypingSession()
    session.startedAt = 1_000
    session.finishedAt = 3_500
    session.attempts = 4
    session.mistakes = 1
    let record = try makeRecord(session, wordCount: 2, id: "r1", device: PracticeDevice(id: "d1", name: "iPad"))
    XCTAssertEqual(record.time, 2.5)
    XCTAssertEqual(record.accuracy, 75)
    XCTAssertEqual(record.date, "1970-01-01T00:00:03.500Z")
    let list = WordList(id: "l", name: "L", words: [Word(display: "a", input: "a")], createdAt: "2026-01-01")
    let once = try addRecord([list], listId: "l", record: record)
    XCTAssertEqual(try addRecord(once, listId: "l", record: record), once)
    XCTAssertThrowsError(try addRecord([], listId: "l", record: record)) { XCTAssertEqual($0 as? TypleError, TypleError("recordListDeleted")) }
    XCTAssertThrowsError(try makeRecord(TypingSession(), wordCount: 1, id: "x", device: nil))
  }

  func testBestComparesCurrentWordCount() {
    let words = [Word(display: "a", input: "a"), Word(display: "b", input: "b")]
    let old = StoredRecord(id: "old", time: 1, date: "2026-01-01T00:00:00.000Z", accuracy: 100, wordCount: 1)
    let now = StoredRecord(id: "now", time: 9, date: "2026-01-02T00:00:00.000Z", accuracy: 90, wordCount: 2)
    let list = WordList(id: "l", name: "L", words: words, records: [old, now], createdAt: "2026-01-01")
    XCTAssertEqual(listBest(list), now)
    XCTAssertEqual(recordRows([list]).filter(\.best).map(\.record), [now])
    let ranking = listRanking(list)
    XCTAssertEqual(ranking.ranked, [now])
    XCTAssertEqual(ranking.others, [old])
    XCTAssertFalse(ranking.fallback)
  }

  func testTimePartsAndAccuracy() {
    XCTAssertEqual(recordTimeParts(59.999).map { $0.0 }, ["1", "00.00"])
    XCTAssertEqual(recordTimeParts(5).map { $0.0 }, ["5.00"])
    XCTAssertEqual(recordTimeParts(75.5).map { $0.0 }, ["1", "15.50"])
    XCTAssertEqual(formatAccuracy(97.25), "97.3%")
    XCTAssertEqual(formatAccuracy(100), "100%")
    XCTAssertEqual(formatAccuracy(nil), "—")
  }

  func testDeviceOptionsPutRecordsWithoutDeviceLast() {
    let device = PracticeDevice(id: "d", name: "iPad")
    let records = [StoredRecord(time: 1, date: "2026-01-01"), StoredRecord(time: 1, date: "2026-01-02", device: device)]
    XCTAssertEqual(deviceOptions(records).map(\.value), ["d", noDevice])
  }
}

final class DateTests: XCTestCase {
  func testStoredForms() {
    XCTAssertEqual(parseDate("2026-10-10T02:00:00.000Z")?.timeIntervalSince1970, 1_791_597_600)
    XCTAssertEqual(parseDate("2026-10-10T11:00:00+09:00")?.timeIntervalSince1970, 1_791_597_600)
    XCTAssertEqual(parseDate("2026-10-10")?.timeIntervalSince1970, 1_791_590_400)
    XCTAssertNotNil(parseDate("2024/09/22 10:05"))
    XCTAssertNotNil(parseDate("2026-09-26T03:01:23.866446Z"))
    XCTAssertNil(parseDate("abc"))
    XCTAssertEqual(isoString(Date(timeIntervalSince1970: 1_791_597_600)), "2026-10-10T02:00:00.000Z")
  }
}

final class WordListTests: XCTestCase {
  let words = [Word(display: "a", input: "a")]

  func testValidationAndSave() throws {
    let list = WordList(id: "1", name: " A ", words: words, createdAt: "2026-01-01")
    let saved = try saveList([], list, editing: false)
    XCTAssertEqual(saved[0].name, "A")
    XCTAssertThrowsError(try saveList(saved, WordList(id: "2", name: "a", words: words, createdAt: "2026-01-01"), editing: false)) {
      XCTAssertEqual($0 as? TypleError, TypleError("listNameDuplicate"))
    }
    XCTAssertThrowsError(try saveList(saved, WordList(id: "2", name: "B", words: [], createdAt: "2026-01-01"), editing: false))
    XCTAssertThrowsError(try saveList(saved, WordList(id: "2", name: "B", words: [Word(display: " ", input: "x")], createdAt: "2026-01-01"), editing: false))
    XCTAssertThrowsError(try saveList([], list, editing: true)) { XCTAssertEqual($0 as? TypleError, TypleError("listDeleted")) }
    // Editing keeps the saved records.
    var withRecord = saved
    withRecord[0].records = [StoredRecord(time: 1, date: "2026-01-01")]
    var edited = saved[0]
    edited.name = "C"
    XCTAssertEqual(try saveList(withRecord, edited, editing: true)[0].records.count, 1)
  }

  func testCopyNames() throws {
    let lists = [WordList(id: "1", name: "A", words: words, createdAt: "2026-01-01"),
                 WordList(id: "2", name: "A（コピー）", words: words, createdAt: "2026-01-01")]
    let suffix = { (n: Int) in n == 1 ? "（コピー）" : "（コピー\(n)）" }
    let result = try duplicateList(lists, id: "1", copyId: "3", suffix: suffix)
    XCTAssertEqual(result.copy.name, "A（コピー2）")
    XCTAssertEqual(result.lists.count, 3)
  }

  func testWorkspaceFileRoundTrip() throws {
    let list = WordList(id: "1", name: "A", words: words, records: [StoredRecord(id: "r", time: 1.5, date: "2026-01-01T00:00:00.000Z", mistakes: 0, accuracy: 100, wordCount: 1)], createdAt: "2026-01-01")
    let file = WorkspaceFile(accountId: "ipad:local", revision: 3, document: WorkspaceDocument(lists: [list], devices: [PracticeDevice(id: "d", name: " iPad ")]))
    let decoded = try decodeWorkspaceFile(try encodeWorkspaceFile(file), accountId: "ipad:local")
    XCTAssertEqual(decoded.lists, [list])
    XCTAssertEqual(decoded.devices, [PracticeDevice(id: "d", name: "iPad")])
    XCTAssertThrowsError(try decodeWorkspaceFile(try encodeWorkspaceFile(file), accountId: "other"))
    XCTAssertThrowsError(try decodeWorkspaceFile(Data("{}".utf8), accountId: "ipad:local"))
    // Fields from link sharing are dropped, and unknown record fields do not fail the read.
    let web = #"{"version":1,"accountId":"ipad:local","revision":0,"devices":[],"lists":[{"id":"x","name":"X","createdAt":"2026-01-01","shared":true,"shareId":"s","words":[{"display":"a","input":"a","annotation":""}],"records":[{"time":5,"date":"2024/09/22 10:05"}]}]}"#
    XCTAssertEqual(try decodeWorkspaceFile(Data(web.utf8), accountId: "ipad:local").lists[0].records[0].time, 5)
  }

  func testAccountWorkspace() throws {
    // As /api/workspace answers: an unknown field is ignored, and a record without the optional fields is read.
    let answer = #"{"lists":[{"id":"x","name":"X","createdAt":"2026-01-01","extra":1,"words":[{"display":"a","input":"a","annotation":""}],"records":[{"time":5,"date":"2024/09/22 10:05"}]}],"devices":[{"id":"d","name":" iPad ","layout":""}],"revision":4,"accountId":"github:1"}"#
    let decoded = try decodeAccountWorkspace(Data(answer.utf8))
    XCTAssertEqual(decoded.accountId, "github:1")
    XCTAssertEqual(decoded.revision, 4)
    XCTAssertEqual(decoded.document.lists.map(\.id), ["x"])
    XCTAssertEqual(decoded.document.lists[0].records[0].time, 5)
    XCTAssertEqual(decoded.document.devices, [PracticeDevice(id: "d", name: "iPad")])

    // A save is the whole document for the revision it changes, and reads back as it was.
    let body = try encodeAccountWorkspace(decoded)
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    XCTAssertEqual(Set(json.keys), ["lists", "devices", "revision", "accountId"])
    XCTAssertEqual(json["revision"] as? Int, 4)
    XCTAssertEqual(try decodeAccountWorkspace(body), decoded)

    // An account that has saved nothing shows the starting lists, which its first save keeps.
    let empty = try decodeAccountWorkspace(Data(#"{"lists":[],"devices":[],"revision":0,"accountId":"github:1"}"#.utf8))
    XCTAssertEqual(empty.document.lists, initialLists())
    XCTAssertEqual(empty.revision, 0)

    for invalid in ["{}", #"{"lists":[],"devices":[],"revision":-1,"accountId":"github:1"}"#,
                    #"{"lists":[],"devices":[],"revision":1,"accountId":""}"#, #"{"error":"loginRequired"}"#] {
      XCTAssertThrowsError(try decodeAccountWorkspace(Data(invalid.utf8))) { XCTAssertEqual($0 as? TypleError, TypleError("invalidServerData")) }
    }
    var tooLarge = decoded
    tooLarge.document.lists[0].words = Array(repeating: Word(display: String(repeating: "a", count: 1000), input: String(repeating: "a", count: 100)), count: 1000)
    XCTAssertThrowsError(try encodeAccountWorkspace(tooLarge)) { XCTAssertEqual($0 as? TypleError, TypleError("workspaceTooLarge")) }
  }

  func testInitialLists() {
    let lists = initialLists()
    XCTAssertEqual(lists.map(\.id).prefix(2), ["sample-1", "sample-2"])
    XCTAssertEqual(lists[2].words.count, 193)
    XCTAssertEqual([lists[3].id, lists.last?.id], ["linux-commands-basic", "linux-system"])
    XCTAssertNoThrow(try validateLists(lists))
  }
}

final class DeviceTests: XCTestCase {
  func testDeviceProblems() throws {
    let devices = [PracticeDevice(id: "a", name: "HHKB")]
    XCTAssertEqual(deviceProblem(devices, PracticeDevice(id: "b", name: " "), editing: false)?.error.key, "deviceNameRequired")
    XCTAssertEqual(deviceProblem(devices, PracticeDevice(id: "b", name: "hhkb"), editing: false)?.error, TypleError("deviceNameDuplicate", ["name": "HHKB"]))
    XCTAssertEqual(deviceProblem(devices, PracticeDevice(id: "b", name: "デフォルト"), editing: false, defaultName: "デフォルト")?.field, .name)
    XCTAssertEqual(deviceProblem(devices, PracticeDevice(id: "z", name: "X"), editing: true)?.error.key, "deviceDeleted")
    XCTAssertEqual(try saveDevice(devices, PracticeDevice(id: "b", name: " iPad ", layout: " JIS "), editing: false).last, PracticeDevice(id: "b", name: "iPad", layout: "JIS"))
    XCTAssertNil(chosenDevice(devices, id: "", defaultName: "D"))
    XCTAssertEqual(chosenDevice(devices, id: nil, defaultName: "D")?.id, defaultDeviceId)
    XCTAssertEqual(chosenDevice(devices, id: "gone", defaultName: "D")?.id, defaultDeviceId)
    XCTAssertEqual(chosenDevice(devices, id: "a", defaultName: "D")?.name, "HHKB")
  }
}

final class WordFileTests: XCTestCase {
  func testCsvFeatures() throws {
    XCTAssertEqual(try parseWordFile("\u{feff}display,input,annotation\r\n\"日本,Japan\",Japan,\"one\r\ntwo \"\"quoted\"\"\"\r\n", format: .csv),
                   [Word(display: "日本,Japan", input: "Japan", annotation: "one\r\ntwo \"quoted\"")])
    XCTAssertEqual(try parseWordFile("input\tdisplay\n\nJapan\t日本\n", format: .tsv), [Word(display: "日本", input: "Japan")])
    XCTAssertEqual(try parseWordFile("input\tdisplay\tannotation\nJapan\t日本\t\"a\tb\"", format: .tsv)[0].annotation, "a\tb")
  }

  func testInvalidFilesFail() {
    for text in ["display\nx", "input,display,input\na,b,c", "input,display,other\na,b,c", "input,display", "input,display\na,",
                 "input,display\na,b,c", "input,display\n\"a,b", "input,display\n\"a\"x,b", "input,display\na\"x,b"] {
      XCTAssertThrowsError(try parseWordFile(text, format: .csv), text)
    }
    XCTAssertThrowsError(try parseWordFile("input,display\nok,yes\nno,", format: .csv)) {
      XCTAssertEqual($0 as? TypleError, TypleError("importFieldRequired", ["line": "3"]))
    }
    XCTAssertThrowsError(try parseWordFile("input,display\n" + String(repeating: "a,b\n", count: 1001), format: .csv)) {
      XCTAssertEqual(($0 as? TypleError)?.key, "importTooManyRows")
    }
    XCTAssertThrowsError(try parseWordFile(String(repeating: "a", count: 1024 * 1024 + 1), format: .csv)) {
      XCTAssertEqual(($0 as? TypleError)?.key, "importTooLarge")
    }
  }

  func testCsvRoundTripKeepsWhitespace() throws {
    let words = [Word(display: " 字 ", input: " zi ", annotation: " a\r\nb \"q\""), Word(display: "字", input: "zi")]
    XCTAssertEqual(try parseWordFile(encodeWordCsv(words), format: .csv), words)
    XCTAssertEqual(WordFileFormat(fileName: "Words.TSV"), .tsv)
    XCTAssertNil(WordFileFormat(fileName: "words.txt"))
  }
}
