import Foundation
import XCTest
@testable import TypleCore

// tests/dashboard.test.cjs, with the same Tokyo calendar.
final class DashboardTests: XCTestCase {
  let tokyo = calendar(timeZone: "Asia/Tokyo")
  // Sunday 2026-09-27 21:00 JST
  let now = parseDate("2026-09-27T12:00:00Z")!
  let words = [Word(display: "a", input: "a"), Word(display: "b", input: "b")]

  func record(_ date: String, _ time: Double = 10, wordCount: Int? = 2, accuracy: Double? = 100) -> StoredRecord {
    StoredRecord(id: date + "\(time)", time: time, date: date, mistakes: 0, accuracy: accuracy, wordCount: wordCount)
  }

  func list(_ id: String, _ records: [StoredRecord]) -> WordList {
    WordList(id: id, name: id, words: words, records: records, createdAt: "2026-09-01")
  }

  func testWeeksStartOnLocalMonday() {
    XCTAssertEqual(isoString(startOfWeek(now, calendar: tokyo)), "2026-09-20T15:00:00.000Z")
    let summary = summarize([list("a", [record("2026-09-20T23:30:00Z"), record("2026-09-20T14:30:00Z")])], now: now, calendar: tokyo)
    XCTAssertEqual(summary.weekCount, 1)
  }

  func testSummaryComparesWithLastWeekAndCountsStreak() {
    let summary = summarize([list("a", [
      record("2026-09-27T01:00:00Z", 30), record("2026-09-26T01:00:00Z", 30), record("2026-09-25T01:00:00Z", 30),
      record("2026-09-23T01:00:00Z", 30),
      record("2026-09-14T01:00:00Z", 20), record("2026-09-20T13:00:00Z", 20),
    ])], now: now, calendar: tokyo)
    XCTAssertEqual(summary.weekCount, 4)
    XCTAssertEqual(summary.weekSeconds, 120)
    XCTAssertEqual(summary.previousWeekCount, 1)
    XCTAssertEqual(summary.previousWeekSeconds, 20)
    XCTAssertEqual(summary.streak, 3)
    XCTAssertTrue(summary.practicedToday)
  }

  func testStreakContinuesFromYesterday() {
    let summary = summarize([list("a", [record("2026-09-26T01:00:00Z"), record("2026-09-25T01:00:00Z")])], now: now, calendar: tokyo)
    XCTAssertFalse(summary.practicedToday)
    XCTAssertEqual(summary.streak, 2)
    XCTAssertEqual(summarize([list("a", [record("2026-09-24T01:00:00Z")])], now: now, calendar: tokyo).streak, 0)
  }

  func testAccuracyAveragesLatestTen() {
    var records = (0..<14).map { index in
      record(isoString(Date(timeIntervalSince1970: 1_788_998_400 + Double(index) * 86400)), 10, accuracy: index < 4 ? 80 : 90)
    }
    records.append(record("2026-09-26T00:00:00Z", 10, accuracy: nil))
    let accuracy = summarize([list("a", records)], now: now, calendar: tokyo).accuracy!
    XCTAssertEqual(accuracy.recentCount, 10)
    XCTAssertEqual(accuracy.recent, 90)
    XCTAssertEqual(accuracy.change?.previous, 80)
    XCTAssertEqual(accuracy.change?.previousCount, 4)
    XCTAssertNil(summarize([list("a", [record("2026-09-26T00:00:00Z", 1, accuracy: nil)])], now: now, calendar: tokyo).accuracy)
  }

  func testNextListsRotate() {
    let lists = [
      list("new-1", []), list("new-2", []),
      list("stale-4", [record("2026-09-23T01:00:00Z")]), list("stale-9", [record("2026-09-18T01:00:00Z")]),
      list("weak", [record("2026-09-26T01:00:00Z", 10, accuracy: 70), record("2026-09-10T01:00:00Z", 10, accuracy: 100)]),
      list("fine", [record("2026-09-26T01:00:00Z", 10, accuracy: 95)]),
      list("legacy", [StoredRecord(time: 5, date: "2026/09/26 10:05")]),
    ]
    let picked = nextLists(lists, now: now, calendar: tokyo)
    XCTAssertEqual(picked.map(\.list.id), ["new-1", "stale-9", "weak"])
    XCTAssertEqual(picked[1].reason, .stale(days: 9))
    XCTAssertEqual(picked[2].reason, .accuracy(accuracy: 85, count: 2))
    XCTAssertEqual(nextLists(lists, now: now, limit: 6, calendar: tokyo).map(\.list.id), ["new-1", "stale-9", "weak", "new-2", "stale-4"])
    XCTAssertEqual(nextLists([list("x", [record("2026-09-25T14:59:00Z")])], now: now, calendar: tokyo).count, 0)
    XCTAssertEqual(nextLists([list("x", [record("2026-09-24T14:59:00Z")])], now: now, calendar: tokyo).first?.reason, .stale(days: 3))
  }

  func testTrendsUseSecondsPerWord() {
    let trends = listTrends([
      list("older", [record("2026-09-20T01:00:00Z")]),
      list("recent", [
        record("2026-09-26T01:00:00Z", 8, wordCount: 4, accuracy: 95),
        record("2026-09-24T01:00:00Z", 6, wordCount: 2, accuracy: 90),
        StoredRecord(time: 9, date: "2026-09-22T01:00:00Z"),
        record("2026-09-25T01:00:00Z", 5, wordCount: 2, accuracy: 100),
      ]),
      list("empty", []),
    ])
    XCTAssertEqual(trends.map(\.list.id), ["recent", "older"])
    let recent = trends[0]
    XCTAssertEqual(recent.count, 4)
    XCTAssertEqual(recent.speed.points.map(\.value), [3, 2.5, 2])
    XCTAssertEqual(recent.accuracy.points.map(\.value), [90, 100, 95])
    XCTAssertEqual(recent.speed.change, Change(recent: 2.25, recentCount: 2, previous: 3, previousCount: 1))
    XCTAssertEqual(recent.best.accuracy, 100)
    XCTAssertNil(trends[1].speed.change)
  }

  func testTrendsKeepTwentyPoints() {
    let records = (0..<25).map { index in
      record(isoString(Date(timeIntervalSince1970: 1_788_220_800 + Double(index) * 86400)), Double(index + 1), wordCount: 1)
    }
    let trend = listTrends([list("a", records)])[0]
    XCTAssertEqual(trend.speed.points.count, 20)
    XCTAssertEqual(trend.speed.points[0].value, 6)
    XCTAssertEqual(trend.speed.change, Change(recent: 23, recentCount: 5, previous: 18, previousCount: 5))
  }

  func testChartScales() {
    XCTAssertEqual(speedScale([1.42, 1.92]), Scale(domain: (1, 2), ticks: [2, 1.5, 1], decimals: 1))
    XCTAssertEqual(speedScale([2.6, 3.5]), Scale(domain: (2.5, 3.5), ticks: [3.5, 3, 2.5], decimals: 1))
    XCTAssertEqual(speedScale([0.31, 0.33]).ticks, [0.34, 0.32, 0.3])
    XCTAssertEqual(speedScale([0, 0]).domain.1, 0.01)
    for values in [[1.42, 1.92], [2.6, 3.5], [0.31, 0.33], [7, 70], [0, 0]] {
      let domain = speedScale(values).domain
      XCTAssertTrue(domain.0 <= values.min()! && domain.1 >= values.max()!, "\(values)")
    }
    XCTAssertEqual(accuracyScale([92, 98]).ticks, [100, 90, 80])
    XCTAssertEqual(accuracyScale([55, 98]).ticks, [100, 75, 50])
  }

  func testDurationsAndDays() {
    XCTAssertEqual(durationParts(45.4).map { $0.0 }, ["45"])
    XCTAssertEqual(durationParts(1112).map { $0.0 }, ["18", "32"])
    XCTAssertEqual(durationParts(3725).map { $0.0 }, ["1", "2"])
    XCTAssertEqual(dayKind(parseDate("2026-09-27T00:30:00Z")!, now: now, calendar: tokyo), .today)
    XCTAssertEqual(dayKind(parseDate("2026-09-26T14:30:00Z")!, now: now, calendar: tokyo), .yesterday)
    XCTAssertEqual(dayKind(parseDate("2026-09-19T01:00:00Z")!, now: now, calendar: tokyo), .thisYear)
    XCTAssertEqual(dayKind(parseDate("2025-12-31T01:00:00Z")!, now: now, calendar: tokyo), .otherYear)
  }
}
