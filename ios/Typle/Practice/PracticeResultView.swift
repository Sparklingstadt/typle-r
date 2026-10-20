import SwiftUI
import TypleCore

/// The result of a finished run (src/components/Practice/PracticeResult.tsx). Ranks use the same order as the best
/// records, so only rank 1 is shown as an improvement, and only runs at this word count are compared.
struct PracticeResultView: View {
  @Environment(AppModel.self) private var app
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

  private func compare() -> (rank: Int, comparison: Comparison) {
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
    let compared = compare()
    let isBest: Bool = { if case .best = compared.comparison { return true } else { return false } }()
    let faster: Bool = { if case .best(let difference) = compared.comparison { return difference < 0 } else { return false } }()
    VStack(alignment: .leading, spacing: 20) {
      HStack(spacing: 12) {
        Text(L("practice.result.title")).font(.system(size: 26, weight: .bold))
        if isBest {
          Label(L("practice.result.newBest"), systemImage: "trophy")
            .font(.system(size: 13, weight: .bold))
            .labelStyle(TightLabelStyle())
            .foregroundStyle(Palette.amber)
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(Palette.amberSoft, in: Capsule())
        }
      }
      HStack(spacing: 12) {
        tile(L("practice.result.time"), Format.seconds(result.time), unit: L("practice.result.seconds"),
             note: note(compared.comparison), good: isBest, icon: faster ? "chart.line.downtrend.xyaxis" : nil)
        tile(L("practice.result.accuracy"), Format.number(result.accuracy, digits: 2), unit: "%", note: L("practice.result.mistakes", result.mistakes))
        tile(L("practice.result.speed"), typingSpeed(session, now: 0).map { "\($0)" } ?? "—", unit: L("practice.result.speedUnit"),
             note: L("practice.result.correct", session.attempts - session.mistakes))
        tile(L("practice.result.words"), "\(list.words.count)", unit: L("practice.result.wordUnit"), note: Format.device(device), icon: "keyboard")
      }
      Group {
        switch saveState {
        case .failed:
          VStack(alignment: .leading, spacing: 10) {
            Label(L("practice.result.saveFailed"), systemImage: "exclamationmark.circle").foregroundStyle(Palette.destructive)
            Button(L("practice.result.retry"), action: onRetry).buttonStyle(.typle(.outline))
          }
          .padding(14)
          .background(Palette.destructive.opacity(0.05), in: RoundedRectangle(cornerRadius: Radius.lg))
          .outlined(radius: Radius.lg, color: Palette.destructive.opacity(0.4))
        case .saving, .idle:
          Label(L("practice.result.saving"), systemImage: "arrow.triangle.2.circlepath").foregroundStyle(Palette.mutedForeground)
        case .saved:
          Label(L("practice.result.saved", compared.rank), systemImage: "checkmark.circle").foregroundStyle(Palette.success)
        }
      }
      .font(.system(size: 14))
      .labelStyle(TightLabelStyle())
      HStack(spacing: 8) {
        Button(action: onRestart) {
          HStack(spacing: 8) {
            Label(L("practice.result.again"), systemImage: "arrow.counterclockwise")
            Text("Enter").font(.system(size: 11, weight: .medium)).padding(.horizontal, 5).frame(height: 20)
              .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Palette.primaryForeground.opacity(0.4)))
          }
        }
        .buttonStyle(.typle(.primary, size: .lg))
        .keyboardShortcut(.return, modifiers: [])
        Button(L("practice.result.chooseList"), action: onChooseList).buttonStyle(.typle(.outline, size: .lg))
        Button { app.navigate(.records) } label: {
          HStack(spacing: 6) { Text(L("practice.result.viewRecords")); Image(systemName: "arrow.right").font(.system(size: 12)) }
        }
        .buttonStyle(.typle(.ghost, size: .lg))
      }
    }
    .padding(.horizontal, 24)
    .padding(.top, 28)
    .padding(.bottom, 24)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(L("practice.result.completed", list.name))
  }

  private func note(_ comparison: Comparison) -> String {
    switch comparison {
    case .behind(let previous):
      let time = Format.seconds(previous.time)
      return previous.accuracy.map { L("practice.result.behind", time, Format.number($0, digits: 2)) } ?? L("practice.result.behindNoAccuracy", time)
    case .best(let difference):
      return difference < 0 ? L("practice.result.faster", Format.seconds(-difference)) : L("practice.result.bestByAccuracy")
    case .firstAtCount: return L("practice.result.firstAtCount", list.words.count)
    case .firstForList: return L("practice.result.firstForList")
    }
  }

  private func tile(_ term: String, _ value: String, unit: String, note: String, good: Bool = false, icon: String? = nil) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(term).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
      ValueWithUnit(value: value, unit: unit, size: 28)
      HStack(alignment: .top, spacing: 4) {
        if let icon { Image(systemName: icon).font(.system(size: 10)).padding(.top, 2) }
        Text(note).fixedSize(horizontal: false, vertical: true)
      }
      .font(.system(size: 12, weight: good ? .medium : .regular))
      .foregroundStyle(good ? Palette.success : Palette.mutedForeground)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .outlined()
    .accessibilityElement(children: .combine)
  }
}
