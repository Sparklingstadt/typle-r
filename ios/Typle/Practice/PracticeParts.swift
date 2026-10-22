import SwiftUI
import TypleCore

/// The characters to type, coloured by what has been typed (src/components/Practice/TargetText.tsx): green when
/// done, a caret under the next one, red from the first mistake, and grey for the rest.
struct TargetTextView: View {
  var comparison: InputComparison
  var size: CGFloat

  var body: some View {
    // Each character is its own view so the caret and error backgrounds sit exactly as on the web.
    FlowLayout(spacing: 0, lineSpacing: size * 0.15) {
      ForEach(comparison.characters.indices, id: \.self) { index in
        character(comparison.characters[index], comparison.states[index])
      }
      ForEach(comparison.extra.indices, id: \.self) { index in
        Text(comparison.extra[index])
          .strikethrough()
          .foregroundStyle(Palette.destructive)
          .background(Palette.destructiveSoft, in: RoundedRectangle(cornerRadius: 3))
      }
    }
    .font(.system(size: size, weight: .medium))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(comparison.characters.joined())
  }

  @ViewBuilder
  private func character(_ text: String, _ state: CharacterState) -> some View {
    switch state {
    case .done: Text(text).foregroundStyle(Palette.success)
    case .pending: Text(text).foregroundStyle(Palette.pending)
    case .error:
      Text(text).foregroundStyle(Palette.destructive).background(Palette.destructiveSoft, in: RoundedRectangle(cornerRadius: 3))
    case .current, .currentError:
      Text(text)
        .foregroundStyle(state == .current ? Palette.foreground : Palette.pending)
        .overlay(alignment: .bottom) {
          Capsule().fill(state == .current ? Palette.foreground : Palette.destructive)
            .frame(height: max(3, size * 0.06))
            .offset(y: size * 0.08)
            .modifier(Blink())
        }
    }
  }
}

/// The caret's slow pulse, unless Reduce Motion is on.
private struct Blink: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var dim = false
  func body(content: Content) -> some View {
    content
      .opacity(dim ? 0.4 : 1)
      .onAppear {
        guard !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { dim = true }
      }
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
      HStack(spacing: 0) {
        stat("timer", L("practice.stats.elapsed"), clock(elapsed))
        stat("gauge.with.needle", L("practice.stats.speed"), speed.map { "\($0)" } ?? "—", unit: L("practice.stats.speedUnit"))
        stat("target", L("practice.stats.accuracy"), session.attempts > 0 ? formatAccuracy(sessionResult(session).accuracy) : "—")
        stat("xmark", L("practice.stats.mistakes"), "\(session.mistakes)")
      }
      .padding(.vertical, 12)
      .background(Palette.muted.opacity(0.4), in: RoundedRectangle(cornerRadius: Radius.xl))
      .outlined()
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
      HStack(spacing: 4) {
        Image(systemName: icon).font(.system(size: 10))
        Text(term)
      }
      .font(.system(size: 12))
      .foregroundStyle(Palette.mutedForeground)
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        Text(value).font(.system(size: 20, weight: .medium)).monospacedDigit()
        if let unit { Text(unit).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground) }
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
      Text(L("practice.best.empty"))
        .font(.system(size: 14))
        .foregroundStyle(Palette.mutedForeground)
        .padding(.horizontal, 8)
        .padding(.vertical, 12)
        .fixedSize(horizontal: false, vertical: true)
    } else {
      VStack(spacing: 2) {
        ForEach(best.indices, id: \.self) { index in
          let record = best[index]
          let current = record.id != nil && record.id == highlightId
          HStack(spacing: 10) {
            RankBadge(rank: index + 1)
            Text(L("practice.best.seconds", Format.seconds(record.time))).font(.system(size: 14, weight: .medium)).monospacedDigit()
            Text(record.accuracy.map { "\(Format.number($0, digits: 2))%" } ?? L("practice.best.noAccuracy"))
              .font(.system(size: 14)).monospacedDigit()
            Text(Format.device(record.device)).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground).lineLimit(1)
            Spacer(minLength: 0)
            if current { Text("NEW").font(.system(size: 10, weight: .bold)).foregroundStyle(Palette.success) }
          }
          .padding(.horizontal, 8)
          .frame(height: 36)
          .background(current ? Palette.successSoft : .clear, in: RoundedRectangle(cornerRadius: Radius.md))
          .accessibilityElement(children: .combine)
        }
      }
    }
  }
}

/// The device the run is recorded with (src/components/Practice/DeviceMenu.tsx). It cannot change while a run goes on.
struct DeviceMenu: View {
  @Environment(AppModel.self) private var app
  var current: PracticeDevice?
  var locked: Bool

  var body: some View {
    Menu {
      Section(L("practice.device.heading")) {
        ForEach([defaultDevice(name: app.defaultDeviceName)] + app.devices) { device in
          Button { app.chooseDevice(device.id) } label: {
            if device.id == current?.id { Label(Format.device(device), systemImage: "checkmark") } else { Text(Format.device(device)) }
          }
        }
        Button { app.chooseDevice("") } label: {
          if current == nil { Label(L("devices.none"), systemImage: "checkmark") } else { Text(L("devices.none")) }
        }
      }
      Divider()
      Button { app.navigate(.devices) } label: { Label(L("practice.device.manage"), systemImage: "desktopcomputer") }
    } label: {
      HStack(spacing: 6) {
        Image(systemName: "keyboard").font(.system(size: 12))
        Text(current.map { Format.device($0) } ?? L("devices.none")).lineLimit(1)
        Image(systemName: locked ? "lock" : "chevron.down").font(.system(size: 10, weight: .semibold))
      }
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(locked ? Palette.mutedForeground : Palette.foreground)
      .padding(.horizontal, 12)
      .frame(height: 32)
      .background(Palette.card, in: Capsule())
      .overlay(Capsule().strokeBorder(Palette.border))
    }
    .plainMenu()
    .disabled(locked)
    .accessibilityLabel(L("practice.device.label", current.map { Format.device($0) } ?? L("devices.none")))
  }
}

/// A list to pick, with a round check like the web's WordListOptions.
struct ListOptionRow: View {
  var list: WordList
  var selected: Bool

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: selected ? "checkmark.circle.fill" : "circle")
        .font(.system(size: 18))
        .foregroundStyle(selected ? Palette.primary : Palette.border)
      VStack(alignment: .leading, spacing: 1) {
        Text(list.name).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.foreground).lineLimit(2)
        Group {
          if let best = listBest(list) {
            Text(L("practice.options.withBest", list.words.count, Format.seconds(best.time)))
          } else {
            Text(L("practice.options.noRecord", list.words.count))
          }
        }
        .font(.system(size: 12))
        .foregroundStyle(Palette.mutedForeground)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(selected ? Palette.muted : .clear, in: RoundedRectangle(cornerRadius: Radius.lg))
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/// Choosing a list, with a filter by name (the web's 「単語リストを選ぶ」 dialog).
struct ListPickerSheet: View {
  @Environment(\.dismiss) private var dismiss
  var lists: [WordList]
  var selectedId: String?
  var onSelect: (String) -> Void
  @State private var query = ""

  var body: some View {
    let filtered = lists.filter { query.trimmingCharacters(in: .whitespaces).isEmpty || $0.name.lowercased().contains(query.trimmingCharacters(in: .whitespaces).lowercased()) }
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 6) {
          Text(L("practice.picker.title")).font(.system(size: 18, weight: .semibold))
          Text(L("practice.picker.description")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
        }
        Spacer()
        Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14)) }
          .buttonStyle(.typle(.ghost, size: .icon))
          .accessibilityLabel(L("common.close"))
      }
      SearchField(prompt: L("practice.picker.filter"), text: $query)
      ScrollView {
        VStack(spacing: 2) {
          ForEach(filtered) { list in
            Button {
              dismiss()
              onSelect(list.id)
            } label: { ListOptionRow(list: list, selected: list.id == selectedId) }
              .buttonStyle(.plain)
          }
          if filtered.isEmpty {
            Text(L("practice.picker.noMatch")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
              .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
          }
        }
      }
    }
    .padding(24)
    .frame(maxWidth: 448)
    .background(Palette.card)
    .sheetSize(width: 448, height: 560)
    .presentationDetents([.medium, .large])
  }
}

/// Lays children out in rows, wrapping to the next row when one is full, centred like the web's flex-wrap text.
struct FlowLayout: Layout {
  var spacing: CGFloat = 8
  var lineSpacing: CGFloat = 8
  var alignment: HorizontalAlignment = .center

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(subviews, width: proposal.width ?? .infinity)
    return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    for row in arrange(subviews, width: bounds.width) {
      var x = bounds.minX + (alignment == .center ? (bounds.width - row.width) / 2 : 0)
      for index in row.members {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y + (row.height - size.height)), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
        x += size.width + spacing
      }
    }
  }

  private struct Row { var members: [Int] = []; var y: CGFloat = 0; var width: CGFloat = 0; var height: CGFloat = 0 }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var row = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      if !row.members.isEmpty && row.width + spacing + size.width > width {
        rows.append(row)
        row = Row(y: row.y + row.height + lineSpacing)
      }
      row.width += (row.members.isEmpty ? 0 : spacing) + size.width
      row.height = max(row.height, size.height)
      row.members.append(index)
    }
    if !row.members.isEmpty { rows.append(row) }
    return rows
  }
}
