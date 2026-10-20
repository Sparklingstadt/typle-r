import SwiftUI
import TypleCore

/// The characters to type, coloured by what has been typed (src/components/Practice/TargetText.tsx).
struct TargetTextView: View {
  var comparison: InputComparison
  var font: Font

  var body: some View {
    Text(attributed)
      .font(font)
      .multilineTextAlignment(.center)
      .accessibilityLabel(comparison.characters.joined())
  }

  private var attributed: AttributedString {
    var result = AttributedString()
    for (index, character) in comparison.characters.enumerated() {
      var part = AttributedString(character)
      switch comparison.states[index] {
      case .done: part.foregroundColor = Color.green
      case .current: part.underlineStyle = Text.LineStyle.single
      case .error:
        part.foregroundColor = Color.red
        part.backgroundColor = Color.red.opacity(0.15)
      case .currentError:
        part.foregroundColor = Color.secondary
        part.underlineStyle = Text.LineStyle(pattern: .solid, color: .red)
      case .pending: part.foregroundColor = Color.secondary
      }
      result += part
    }
    for character in comparison.extra {
      var part = AttributedString(character)
      part.foregroundColor = Color.red
      part.backgroundColor = Color.red.opacity(0.15)
      part.strikethroughStyle = Text.LineStyle.single
      result += part
    }
    return result
  }
}

/// The live elapsed time, speed, accuracy and mistakes. Only this view ticks, five times a second, while a run goes on.
struct LiveStatsView: View {
  var session: TypingSession

  var body: some View {
    let running = session.startedAt != nil && session.finishedAt == nil
    TimelineView(.periodic(from: .now, by: running ? 0.2 : 3600)) { context in
      let now = context.date.timeIntervalSince1970 * 1000
      let elapsed = running ? max(0, now - (session.startedAt ?? now)) : 0
      let speed = running ? typingSpeed(session, now: now) : nil
      HStack {
        stat("timer", L("practice.stats.elapsed"), clock(elapsed))
        stat("gauge.with.needle", L("practice.stats.speed"), speed.map { "\($0)" } ?? "—", unit: L("practice.stats.speedUnit"))
        stat("target", L("practice.stats.accuracy"), session.attempts > 0 ? formatAccuracy(sessionResult(session).accuracy) : "—")
        stat("xmark", L("practice.stats.mistakes"), "\(session.mistakes)")
      }
      .padding(.vertical, 10)
      .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(L("practice.stats.label"))
  }

  private func clock(_ milliseconds: Double) -> String {
    let seconds = milliseconds / 1000
    return String(format: "%d:%04.1f", Int(seconds / 60), seconds.truncatingRemainder(dividingBy: 60))
  }

  private func stat(_ icon: String, _ term: String, _ value: String, unit: String? = nil) -> some View {
    VStack(spacing: 2) {
      Label(term, systemImage: icon).font(.caption).foregroundStyle(.secondary).labelStyle(.titleAndIcon)
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        Text(value).font(.title3.weight(.medium)).monospacedDigit()
        if let unit { Text(unit).font(.caption).foregroundStyle(.secondary) }
      }
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }
}

/// The five best runs of a list (src/components/Practice/PracticeBestRecords.tsx).
struct BestRecordsView: View {
  var records: [StoredRecord]
  var highlightId: String?

  var body: some View {
    let best = bestRecords(records)
    if best.isEmpty {
      Text(L("practice.best.empty")).font(.footnote).foregroundStyle(.secondary)
    } else {
      VStack(spacing: 0) {
        ForEach(Array(best.enumerated()), id: \.offset) { index, record in
          HStack(spacing: 10) {
            Text("\(index + 1)").font(.callout.weight(.bold)).monospacedDigit().frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
              Text(Format.duration(record.time)).font(.callout.weight(.medium)).monospacedDigit()
              Text(Format.device(record.device)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
              Text(formatAccuracy(record.accuracy)).font(.callout).monospacedDigit()
              if record.id != nil && record.id == highlightId {
                Text(L("practice.best.current")).font(.caption.weight(.medium)).foregroundStyle(.tint)
              } else {
                Text(Format.date(record.date)).font(.caption).foregroundStyle(.secondary)
              }
            }
          }
          .padding(.vertical, 8)
          .padding(.horizontal, 6)
          .background(record.id != nil && record.id == highlightId ? Color.accentColor.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 8))
          .accessibilityElement(children: .combine)
          if index < best.count - 1 { Divider() }
        }
      }
    }
  }
}

/// The device the run is recorded with. It cannot change while a run goes on.
struct DeviceMenu: View {
  @Environment(AppModel.self) private var app
  var current: PracticeDevice?
  var locked: Bool

  var body: some View {
    Menu {
      Picker(L("devices.choose"), selection: Binding(get: { current?.id ?? "" }, set: { app.chooseDevice($0) })) {
        Text(L("format.defaultDevice")).tag(defaultDeviceId)
        ForEach(app.devices) { device in Text(Format.device(device)).tag(device.id) }
        Text(L("devices.none")).tag("")
      }
    } label: {
      Label(current.map { Format.device($0) } ?? L("devices.none"), systemImage: locked ? "lock" : "keyboard")
        .lineLimit(1)
    }
    .disabled(locked)
    .accessibilityLabel(L("devices.choose"))
  }
}

/// Choosing a list, with a filter by name.
struct ListPickerSheet: View {
  @Environment(\.dismiss) private var dismiss
  var lists: [WordList]
  var selectedId: String?
  var onSelect: (String) -> Void
  @State private var query = ""

  var body: some View {
    NavigationStack {
      let filtered = lists.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query.trimmingCharacters(in: .whitespaces)) }
      List(filtered) { list in
        Button {
          dismiss()
          onSelect(list.id)
        } label: {
          ListOptionRow(list: list, selected: list.id == selectedId)
        }
        .foregroundStyle(.primary)
      }
      .overlay {
        if filtered.isEmpty { ContentUnavailableView(L("practice.picker.noMatch"), systemImage: "magnifyingglass") }
      }
      .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: L("practice.picker.filter"))
      .navigationTitle(L("practice.picker.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button(L("common.close")) { dismiss() } } }
    }
  }
}

struct ListOptionRow: View {
  var list: WordList
  var selected: Bool

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(list.name).font(.body.weight(selected ? .semibold : .regular)).lineLimit(2)
        Group {
          if let best = listBest(list) {
            Text(L("practice.options.withBest", list.words.count, Format.duration(best.time)))
          } else {
            Text(L("practice.options.noRecord", list.words.count))
          }
        }
        .font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      if selected { Image(systemName: "checkmark").foregroundStyle(.tint) }
    }
    .contentShape(Rectangle())
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
