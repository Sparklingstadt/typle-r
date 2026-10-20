import Foundation

// src/core/rankings.ts

public let rankingTop = 5
/// A best set within this many days is marked as improved in the list.
public let improvedDays = 7.0
private let dayMs = 24.0 * 60 * 60 * 1000
private let trendPoints = 20
private let recentRuns = 5

public struct ListRanking: Identifiable, Sendable {
  public var list: WordList
  /// The list's records on the chosen device, at any word count.
  public var records: [StoredRecord]
  public var ranked: [StoredRecord]
  /// Records at another word count than the list has now; they are ranked only when asked for, or when nothing else exists.
  public var others: [StoredRecord]
  public var otherCounts: [(wordCount: Int?, count: Int)]
  public var fallback: Bool
  public var best: StoredRecord?
  public var lastPracticed: Date?
  public var improved: Bool
  public var id: String { list.id }
}

/// Uses the same comparison as `listBest`, so a list's rank 1 here is the best shown on every other screen.
public func listRanking(_ list: WordList, device: String? = nil, order: RankOrder = .accuracy, includeOthers: Bool = false, now: Date = Date()) -> ListRanking {
  let records = list.records.filter { matchesDevice($0, device) }
  let others = records.filter { $0.wordCount != list.words.count }
  let fallback = !others.isEmpty && others.count == records.count
  let ranked = rankRecords(includeOthers ? records : comparableRecords(list, records), order: order)
  var counts: [(wordCount: Int?, count: Int)] = []
  for record in others {
    if let index = counts.firstIndex(where: { $0.wordCount == record.wordCount }) { counts[index].count += 1 }
    else { counts.append((wordCount: record.wordCount, count: 1)) }
  }
  let last = records.map { timeOf($0.date) }.max() ?? 0
  let best = ranked.first
  let bestTime = best.map { timeOf($0.date) } ?? 0
  return ListRanking(
    list: list, records: records, ranked: ranked, others: others,
    otherCounts: counts.stableSorted { ($0.wordCount ?? -1) > ($1.wordCount ?? -1) },
    fallback: fallback, best: best,
    lastPracticed: last > 0 ? Date(timeIntervalSince1970: last / 1000) : nil,
    improved: best != nil && now.timeIntervalSince1970 * 1000 - bestTime < improvedDays * dayMs &&
      ranked.contains { timeOf($0.date) < bestTime })
}

public enum ListSort: String, CaseIterable, Sendable {
  case recent, name, count
}

public func sortRankings(_ rankings: [ListRanking], sort: ListSort, locale: Locale = .current) -> [ListRanking] {
  let recent = { (a: ListRanking, b: ListRanking) in
    (a.lastPracticed?.timeIntervalSince1970 ?? 0) > (b.lastPracticed?.timeIntervalSince1970 ?? 0)
  }
  return rankings.stableSorted { a, b in
    switch sort {
    case .name: return a.list.name.compare(b.list.name, options: [], range: nil, locale: locale) == .orderedAscending
    case .count: return a.records.count != b.records.count ? a.records.count > b.records.count : recent(a, b)
    case .recent: return recent(a, b)
    }
  }
}

public struct RankingStats: Sendable {
  public var recentCount: Int
  public var recentTime: Double?
  public var recentAccuracy: Double?
  public var points: [(date: String, value: Double)]
}

/// The figures above the table: the latest runs show where practice is now, next to the best.
public func rankingStats(_ ranked: [StoredRecord]) -> RankingStats {
  let byDate = ranked.stableSorted { timeOf($0.date) < timeOf($1.date) }
  let recent = Array(byDate.suffix(recentRuns))
  let accuracies = recent.compactMap(\.accuracy)
  return RankingStats(
    recentCount: recent.count,
    recentTime: recent.isEmpty ? nil : recent.reduce(0) { $0 + $1.time } / Double(recent.count),
    recentAccuracy: accuracies.isEmpty ? nil : accuracies.reduce(0, +) / Double(accuracies.count),
    points: byDate.suffix(trendPoints).map { (date: $0.date, value: $0.time) })
}
