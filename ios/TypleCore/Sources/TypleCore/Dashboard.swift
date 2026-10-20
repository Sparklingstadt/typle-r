import Foundation

// src/core/dashboard.ts. Records store UTC timestamps; every day and week boundary here follows the viewer's local
// calendar, which tests pin by passing their own.

public let staleDays = 3
public let lowAccuracy = 90.0
private let dashboardTrendPoints = 20

private func localCalendar(_ zone: TimeZone) -> Calendar {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = zone
  return calendar
}

public func startOfWeek(_ date: Date, calendar: Calendar = .current) -> Date {
  let day = calendar.startOfDay(for: date)
  let weekday = calendar.component(.weekday, from: day) // 1 is Sunday
  return calendar.date(byAdding: .day, value: -((weekday + 5) % 7), to: day)!
}

func daysBetween(_ from: Date, _ to: Date, calendar: Calendar) -> Int {
  calendar.dateComponents([.day], from: calendar.startOfDay(for: from), to: calendar.startOfDay(for: to)).day ?? 0
}

private func newestFirst(_ records: [StoredRecord]) -> [StoredRecord] {
  records.stableSorted { timeOf($0.date) > timeOf($1.date) }
}

private func average(_ values: [Double]) -> Double { values.reduce(0, +) / Double(values.count) }

public struct Change: Equatable, Sendable {
  public var recent: Double
  public var recentCount: Int
  public var previous: Double
  public var previousCount: Int
}

private func change(_ newest: [Double], recentCount: Int, previousCount: Int) -> Change? {
  guard recentCount > 0, previousCount > 0 else { return nil }
  return Change(recent: average(Array(newest.prefix(recentCount))), recentCount: recentCount,
                previous: average(Array(newest.dropFirst(recentCount).prefix(previousCount))), previousCount: previousCount)
}

public struct DashboardSummary: Equatable, Sendable {
  public var weekStart: Date
  public var weekCount: Int
  public var previousWeekCount: Int
  public var weekSeconds: Double
  public var previousWeekSeconds: Double
  public var streak: Int
  public var practicedToday: Bool
  public var accuracy: (recent: Double, recentCount: Int, change: Change?)?

  public static func == (a: DashboardSummary, b: DashboardSummary) -> Bool {
    a.weekStart == b.weekStart && a.weekCount == b.weekCount && a.streak == b.streak && a.weekSeconds == b.weekSeconds
  }
}

public func summarize(_ lists: [WordList], now: Date = Date(), calendar: Calendar = .current) -> DashboardSummary {
  let records = lists.flatMap(\.records)
  let weekStart = startOfWeek(now, calendar: calendar)
  func between(_ from: Date, _ to: Date) -> [StoredRecord] {
    records.filter { timeOf($0.date) >= from.timeIntervalSince1970 * 1000 && timeOf($0.date) <= to.timeIntervalSince1970 * 1000 }
  }
  let week = between(weekStart, calendar.date(byAdding: .day, value: 7, to: weekStart)!.addingTimeInterval(-0.001))
  // Compare against the same point of last week so Monday is not measured against a whole week.
  let previousWeek = between(calendar.date(byAdding: .day, value: -7, to: weekStart)!, calendar.date(byAdding: .day, value: -7, to: now)!)
  let days = Set(records.map { calendar.startOfDay(for: Date(timeIntervalSince1970: timeOf($0.date) / 1000)) })
  let today = calendar.startOfDay(for: now)
  let practicedToday = days.contains(today)
  var streak = 0
  var day = practicedToday ? today : calendar.date(byAdding: .day, value: -1, to: today)!
  while days.contains(day) {
    streak += 1
    day = calendar.date(byAdding: .day, value: -1, to: day)!
  }
  let newest = newestFirst(records).compactMap(\.accuracy)
  let recentCount = min(10, newest.count)
  return DashboardSummary(
    weekStart: weekStart, weekCount: week.count, previousWeekCount: previousWeek.count,
    weekSeconds: week.reduce(0) { $0 + $1.time }, previousWeekSeconds: previousWeek.reduce(0) { $0 + $1.time },
    streak: streak, practicedToday: practicedToday,
    accuracy: recentCount > 0
      ? (average(Array(newest.prefix(recentCount))), recentCount, change(newest, recentCount: recentCount, previousCount: min(10, newest.count - recentCount)))
      : nil)
}

public enum NextListReason: Equatable, Sendable {
  case new
  case stale(days: Int)
  case accuracy(accuracy: Double, count: Int)
}

public struct NextList: Identifiable, Sendable {
  public var list: WordList
  public var lastPracticed: Date?
  public var reason: NextListReason
  public var id: String { list.id }
}

/// Lists to practise next: unused ones, ones not practised for days, and ones with low recent accuracy, taken in turn.
public func nextLists(_ lists: [WordList], now: Date = Date(), limit: Int = 3, calendar: Calendar = .current) -> [NextList] {
  var groups: [[NextList]] = [[], [], []]
  for list in lists {
    let records = newestFirst(list.records)
    guard let latest = records.first else {
      groups[0].append(NextList(list: list, lastPracticed: nil, reason: .new))
      continue
    }
    let lastPracticed = Date(timeIntervalSince1970: timeOf(latest.date) / 1000)
    let days = daysBetween(lastPracticed, now, calendar: calendar)
    if days >= staleDays {
      groups[1].append(NextList(list: list, lastPracticed: lastPracticed, reason: .stale(days: days)))
      continue
    }
    let recent = Array(records.compactMap(\.accuracy).prefix(5))
    if !recent.isEmpty && average(recent) < lowAccuracy {
      groups[2].append(NextList(list: list, lastPracticed: lastPracticed, reason: .accuracy(accuracy: average(recent), count: recent.count)))
    }
  }
  func days(_ item: NextList) -> Int { if case .stale(let days) = item.reason { return days } else { return 0 } }
  func accuracy(_ item: NextList) -> Double { if case .accuracy(let value, _) = item.reason { return value } else { return 0 } }
  groups[1] = groups[1].stableSorted { days($0) > days($1) }
  groups[2] = groups[2].stableSorted { accuracy($0) < accuracy($1) }
  // Take from each reason in turn so a pile of unused lists never hides neglected or weak ones.
  var picked: [NextList] = []
  var index = 0
  while picked.count < limit && groups.contains(where: { index < $0.count }) {
    for group in groups where index < group.count && picked.count < limit { picked.append(group[index]) }
    index += 1
  }
  return picked
}

public struct TrendPoint: Equatable, Sendable {
  public var date: String
  public var value: Double

  public init(date: String, value: Double) {
    self.date = date
    self.value = value
  }
}

public struct Trend: Equatable, Sendable {
  public var points: [TrendPoint]
  public var change: Change?
}

public struct ListTrend: Identifiable, Sendable {
  public var list: WordList
  public var count: Int
  public var lastPracticed: Date
  public var speed: Trend
  public var accuracy: Trend
  public var best: StoredRecord
  public var id: String { list.id }
}

private func trend(_ points: [TrendPoint]) -> Trend {
  let newest = Array(points.map(\.value).reversed())
  let recentCount = min(5, (newest.count + 1) / 2)
  return Trend(points: Array(points.suffix(dashboardTrendPoints)),
               change: change(newest, recentCount: recentCount, previousCount: min(5, newest.count - recentCount)))
}

public func listTrends(_ lists: [WordList]) -> [ListTrend] {
  lists.filter { !$0.records.isEmpty }.map { list -> ListTrend in
    let records = Array(newestFirst(list.records).reversed())
    return ListTrend(
      list: list, count: records.count,
      lastPracticed: Date(timeIntervalSince1970: timeOf(records[records.count - 1].date) / 1000),
      // Seconds per word stays comparable after words are added to or removed from a list.
      speed: trend(records.compactMap { record in record.wordCount.map { TrendPoint(date: record.date, value: record.time / Double($0)) } }),
      accuracy: trend(records.compactMap { record in record.accuracy.map { TrendPoint(date: record.date, value: $0) } }),
      best: listBest(list)!)
  }.stableSorted { $0.lastPracticed > $1.lastPracticed }
}

public struct Scale: Equatable, Sendable {
  public var domain: (Double, Double)
  public var ticks: [Double]
  public var decimals: Int

  public static func == (a: Scale, b: Scale) -> Bool {
    a.domain == b.domain && a.ticks == b.ticks && a.decimals == b.decimals
  }
}

private func tidy(_ value: Double) -> Double { (value * 1e6).rounded() / 1e6 }

private func niceStep(_ value: Double) -> Double {
  let power = pow(10, floor(log10(value)))
  let fraction = value / power
  return tidy((fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power)
}

private func decimals(_ step: Double) -> Int {
  var text = String(step)
  if text.hasSuffix(".0") { text.removeLast(2) }
  return text.split(separator: ".").dropFirst().first?.count ?? 0
}

public func speedScale(_ values: [Double]) -> Scale {
  let low0 = values.min() ?? 0, high = values.max() ?? 0
  var step = niceStep(max(high - low0, high * 0.1, 0.01) / 2)
  var low = tidy(floor(low0 / step) * step)
  while tidy(low + step * 2) < high {
    step = niceStep(step * 1.001)
    low = tidy(floor(low0 / step) * step)
  }
  return Scale(domain: (low, tidy(low + step * 2)), ticks: [tidy(low + step * 2), tidy(low + step), low], decimals: decimals(step))
}

public func accuracyScale(_ values: [Double]) -> Scale {
  let low = max(0, min(80, floor((values.min() ?? 0) / 10) * 10))
  return Scale(domain: (low, 100), ticks: [100, (low + 100) / 2, low], decimals: 0)
}

/// A total practice time in whole units, such as 18 minutes 32 seconds.
public func durationParts(_ seconds: Double) -> [(String, TimeUnit)] {
  let total = Int(seconds.rounded())
  if total < 60 { return [(String(total), .seconds)] }
  if total < 3600 { return [(String(total / 60), .minutes), (String(total % 60), .seconds)] }
  return [(String(total / 3600), .hours), (String(total % 3600 / 60), .minutes)]
}

public enum DayKind: Sendable {
  case today, yesterday, thisYear, otherYear
}

/// How a day reads next to today: today and yesterday by name, other days by date, with the year only when it differs.
public func dayKind(_ date: Date, now: Date = Date(), calendar: Calendar = .current) -> DayKind {
  let days = daysBetween(date, now, calendar: calendar)
  if days == 0 { return .today }
  if days == 1 { return .yesterday }
  return calendar.component(.year, from: date) == calendar.component(.year, from: now) ? .thisYear : .otherYear
}

/// The calendar of a named time zone, for callers that need a fixed one.
public func calendar(timeZone identifier: String) -> Calendar {
  localCalendar(TimeZone(identifier: identifier) ?? .current)
}
