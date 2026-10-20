import SwiftUI
import TypleCore

/// The result of a finished run (src/components/Practice/PracticeResult.tsx). Ranks use the same order as the best
/// records, so only rank 1 is shown as an improvement, and only runs at this word count are compared.
struct PracticeResultView: View {
  var list: WordList
  var session: TypingSession
  var device: PracticeDevice?
  var record: StoredRecord?
  var saveState: SaveState
  var onRestart: () -> Void
  var onRetry: () -> Void
  var onChooseList: () -> Void

  private enum Comparison {
    case firstAtCount, firstForList
    case best(difference: Double)
    case behind(previous: StoredRecord)
  }

  private var rankAndComparison: (rank: Int, comparison: Comparison) {
    let wordCount = list.words.count
    let ranked = rankRecords(list.records.filter { $0.wordCount == wordCount })
    let rank = record != nil && saveState == .saved ? (ranked.firstIndex { $0.id == record?.id } ?? -1) + 1 : 0
    guard let previous = ranked.first(where: { $0.id != record?.id }) else {
      return (rank, list.records.contains { $0.id != record?.id } ? .firstAtCount : .firstForList)
    }
    if rank == 1, let record { return (rank, .best(difference: record.time - previous.time)) }
    return (rank, .behind(previous: previous))
  }

  var body: some View {
    let result = sessionResult(session)
    let compared = rankAndComparison
    let rank = compared.rank
    let comparison = compared.comparison
    let isBest: Bool = { if case .best = comparison { return true } else { return false } }()
    VStack(alignment: .leading, spacing: 18) {
      HStack(spacing: 12) {
        Text(L("practice.result.title")).font(.title.weight(.bold))
        if isBest {
          Label(L("practice.result.newBest"), systemImage: "trophy.fill")
            .font(.callout.weight(.bold))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Color.orange.opacity(0.18), in: Capsule())
            .foregroundStyle(.orange)
        }
      }
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
        tile(L("practice.result.time"), String(format: "%.2f", result.time), unit: L("practice.result.seconds"), note: note(comparison), good: isBest)
        tile(L("practice.result.accuracy"), Format.number(result.accuracy, digits: 2), unit: "%", note: L("practice.result.mistakes", result.mistakes))
        tile(L("practice.result.speed"), typingSpeed(session, now: 0).map { "\($0)" } ?? "—", unit: L("practice.result.speedUnit"),
             note: L("practice.result.correct", session.attempts - session.mistakes))
        tile(L("practice.result.words"), "\(list.words.count)", unit: L("practice.result.wordUnit"), note: Format.device(device))
      }
      Group {
        switch saveState {
        case .failed:
          VStack(alignment: .leading, spacing: 8) {
            Label(L("practice.result.saveFailed"), systemImage: "exclamationmark.circle").foregroundStyle(.red)
            Button(L("practice.result.retry"), action: onRetry).buttonStyle(.bordered)
          }
        case .saving, .idle: Label(L("practice.result.saving"), systemImage: "arrow.triangle.2.circlepath").foregroundStyle(.secondary)
        case .saved: Label(L("practice.result.saved", rank), systemImage: "checkmark.circle").foregroundStyle(.green)
        }
      }
      .font(.callout)
      HStack(spacing: 12) {
        Button(action: onRestart) { Label(L("practice.result.again"), systemImage: "arrow.counterclockwise") }
          .buttonStyle(.borderedProminent)
          .keyboardShortcut(.return, modifiers: [])
        Button(L("practice.result.chooseList"), action: onChooseList).buttonStyle(.bordered)
      }
      .controlSize(.large)
    }
    .padding(24)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(L("practice.result.completed", list.name))
  }

  private func note(_ comparison: Comparison) -> String {
    switch comparison {
    case .behind(let previous):
      let time = String(format: "%.2f", previous.time)
      return previous.accuracy.map { L("practice.result.behind", time, Format.number($0, digits: 2)) } ?? L("practice.result.behindNoAccuracy", time)
    case .best(let difference):
      return difference < 0 ? L("practice.result.faster", String(format: "%.2f", -difference)) : L("practice.result.bestByAccuracy")
    case .firstAtCount: return L("practice.result.firstAtCount", list.words.count)
    case .firstForList: return L("practice.result.firstForList")
    }
  }

  private func tile(_ term: String, _ value: String, unit: String, note: String, good: Bool = false) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(term).font(.caption).foregroundStyle(.secondary)
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        Text(value).font(.system(size: 28, weight: .medium)).monospacedDigit()
        Text(unit).font(.callout).foregroundStyle(.secondary)
      }
      Text(note).font(.caption).foregroundStyle(good ? Color.green : Color.secondary).fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.quaternary))
    .accessibilityElement(children: .combine)
  }
}
