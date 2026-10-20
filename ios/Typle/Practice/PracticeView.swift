import SwiftUI
import TypleCore

/// The practice screen (src/app/(workspace)/play/page.tsx).
struct PracticeView: View {
  @Environment(AppModel.self) private var app
  @Environment(\.horizontalSizeClass) private var sizeClass
  @State private var model = PracticeModel()
  @State private var pickerOpen = false
  @State private var pendingSwitch: String?
  @State private var showAll = false
  @State private var inputFocused = false
  @State private var focusedOnce = false

  var body: some View {
    Group {
      if let list = model.list(in: app.lists), !list.words.isEmpty {
        content(list)
      } else {
        ContentUnavailableView {
          Label(L("practice.emptyTitle"), systemImage: "text.badge.plus")
        } description: {
          Text(L("practice.empty"))
        } actions: {
          Button(L("practice.aside.create")) { app.section = .lists }.buttonStyle(.borderedProminent)
        }
      }
    }
    .navigationTitle(L("nav.practice"))
    .sheet(isPresented: $pickerOpen, onDismiss: { if !model.finished { model.focusRequest += 1 } }) {
      ListPickerSheet(lists: app.lists, selectedId: model.list(in: app.lists)?.id, onSelect: requestSwitch)
    }
    .alert(L("practice.switch.title"), isPresented: Binding(get: { pendingSwitch != nil }, set: { if !$0 { pendingSwitch = nil } })) {
      Button(L("practice.switch.continue"), role: .cancel) { model.focusRequest += 1 }
      Button(L("practice.switch.confirm"), role: .destructive) { if let id = pendingSwitch { switchTo(id) } }
    } message: {
      if let current = model.list(in: app.lists) {
        Text(L("practice.switch.description", current.name, model.session.index, current.words.count,
               app.lists.first { $0.id == pendingSwitch }?.name ?? ""))
      }
    }
    .onAppear(perform: takeRequest)
    .onChange(of: app.practiceRequest) { takeRequest() }
    // Another store has other lists; a run on a list that is gone cannot be saved.
    .onChange(of: app.store.accountId) { model.restart(listId: app.lists.first?.id) }
  }

  private func takeRequest() {
    guard let id = app.practiceRequest else {
      model.focusRequest += 1
      return
    }
    app.practiceRequest = nil
    if model.running && id != model.listId { pendingSwitch = id } else { switchTo(id) }
  }

  private func requestSwitch(_ id: String) {
    if !model.running { switchTo(id) }
    else if id != model.list(in: app.lists)?.id { pendingSwitch = id }
  }

  private func switchTo(_ id: String) {
    pendingSwitch = nil
    showAll = false
    model.restart(listId: id)
  }

  @ViewBuilder
  private func content(_ list: WordList) -> some View {
    let wide = sizeClass == .regular
    ScrollView {
      if wide {
        HStack(alignment: .top, spacing: 20) {
          card(list)
          aside(list).frame(width: 320)
        }
        .padding(20)
      } else {
        VStack(spacing: 16) {
          card(list)
          aside(list)
        }
        .padding(16)
      }
    }
    .scrollDismissesKeyboard(.never)
    .background(Color(.systemGroupedBackground))
  }

  private func card(_ list: WordList) -> some View {
    let words = list.words
    let session = model.session
    return VStack(spacing: 0) {
      header(list)
      Divider()
      progress(words.count)
      if model.finished {
        PracticeResultView(list: list, session: session, device: model.practiceDevice, record: model.record, saveState: model.saveState,
                           onRestart: { model.restart() }, onRetry: { model.retrySave(app: app) }, onChooseList: { pickerOpen = true })
      } else {
        practice(list)
      }
    }
    .frame(maxWidth: .infinity)
    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
  }

  private func header(_ list: WordList) -> some View {
    HStack(spacing: 8) {
      Button { pickerOpen = true } label: {
        HStack(spacing: 6) {
          Text(list.name).font(.headline).lineLimit(1)
          Text(L("practice.header.wordCount", list.words.count)).font(.footnote).foregroundStyle(.secondary)
          Image(systemName: "chevron.up.chevron.down").font(.footnote).foregroundStyle(.secondary)
        }
      }
      .foregroundStyle(.primary)
      .accessibilityLabel(L("practice.header.switchList", list.name))
      Spacer()
      DeviceMenu(current: model.running ? model.practiceDevice : app.chosenPracticeDevice, locked: model.running)
      Button {
        app.setLiveStatsVisible(!app.liveStatsVisible)
      } label: {
        Image(systemName: app.liveStatsVisible ? "eye" : "eye.slash")
      }
      .accessibilityLabel(L("practice.header.liveStats"))
      .accessibilityValue(app.liveStatsVisible ? L("common.on") : L("common.off"))
      Button { model.restart() } label: {
        Label(L("practice.header.restartShort"), systemImage: "arrow.counterclockwise")
      }
      .accessibilityLabel(L("practice.header.restart"))
      .accessibilityHint(L("practice.header.restartHint"))
    }
    .buttonStyle(.borderless)
    .padding(.horizontal, 16)
    .frame(minHeight: 56)
  }

  private func progress(_ total: Int) -> some View {
    let done = model.finished ? total : model.session.index
    let current = model.finished ? total : model.session.index + 1
    return HStack(spacing: 12) {
      ProgressView(value: Double(done), total: Double(max(total, 1)))
      Text(L("practice.progress.value", current, total)).font(.subheadline.weight(.medium)).monospacedDigit()
    }
    .padding(.horizontal, 20)
    .padding(.top, 14)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(L("practice.progress.label"))
    .accessibilityValue(L("practice.progress.value", current, total))
  }

  @ViewBuilder
  private func practice(_ list: WordList) -> some View {
    let words = list.words
    let session = model.session
    let word = words[min(session.index, words.count - 1)]
    let comparison = compareInput(target: word.input, typed: session.input)
    let showResume = focusedOnce && !inputFocused && !pickerOpen && pendingSwitch == nil
    VStack(spacing: 14) {
      if !word.annotation.isEmpty {
        Text(word.annotation).font(.body).multilineTextAlignment(.center)
      }
      if word.display == word.input {
        TargetTextView(comparison: comparison, font: wordFont(word.display))
      } else {
        Text(word.display).font(wordFont(word.display)).multilineTextAlignment(.center)
        HStack(spacing: 10) {
          Text(L("practice.word.typeThis")).font(.caption).foregroundStyle(.secondary)
            .padding(.horizontal, 8).padding(.vertical, 2).overlay(Capsule().strokeBorder(.quaternary))
          TargetTextView(comparison: comparison, font: .system(size: 30, weight: .medium))
        }
      }
    }
    .frame(maxWidth: .infinity, minHeight: 200)
    .padding(.horizontal, 20)
    .padding(.top, 28)
    .overlay {
      if showResume {
        Button { model.focusRequest += 1 } label: {
          Label(L("practice.word.resume"), systemImage: "hand.tap").padding(.horizontal, 16).padding(.vertical, 10)
        }
        .buttonStyle(.borderedProminent)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.ultraThinMaterial)
      }
    }
    VStack(spacing: 10) {
      PracticeTextField(
        text: session.input, placeholder: L("practice.word.placeholder"), invalid: comparison.errorIndex != nil,
        focusRequest: model.focusRequest,
        onCommit: { value in
          guard let current = model.list(in: app.lists) else { return }
          model.enter(value, list: current, device: app.chosenPracticeDevice, app: app)
        },
        onComposingChange: { model.setComposing($0) },
        onFocusChange: { focused in
          inputFocused = focused
          if focused { focusedOnce = true }
        },
        onEscape: { model.restart() })
        .frame(maxWidth: 440, minHeight: 54, maxHeight: 54)
      Group {
        if let errorIndex = comparison.errorIndex {
          Label(L("practice.feedback.mismatch", errorIndex + 1), systemImage: "exclamationmark.circle").foregroundStyle(.red)
        } else if model.composing {
          Text(L("practice.feedback.composing"))
        } else {
          Text(L("practice.feedback.keys"))
        }
      }
      .font(.footnote)
      .foregroundStyle(.secondary)
      .frame(minHeight: 20)
      .accessibilityAddTraits(.updatesFrequently)
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 12)
    if app.liveStatsVisible {
      LiveStatsView(session: session).padding(.horizontal, 20).padding(.bottom, 16)
    }
    Divider()
    upcoming(words, index: session.index)
  }

  private func upcoming(_ words: [Word], index: Int) -> some View {
    let next = words.dropFirst(index + 1).prefix(3)
    let remaining = words.count - index - 1 - next.count
    return VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Text(L("practice.upcoming.next")).font(.caption).foregroundStyle(.secondary)
        if next.isEmpty { Text(L("practice.upcoming.last")).font(.caption).foregroundStyle(.secondary) }
        ForEach(Array(next.enumerated()), id: \.offset) { _, word in chip(word.display) }
        if remaining > 0 { Text(L("practice.upcoming.more", remaining)).font(.caption).foregroundStyle(.tertiary) }
        Spacer(minLength: 0)
        Button {
          showAll.toggle()
          model.focusRequest += 1
        } label: {
          Label(L("practice.upcoming.showAll"), systemImage: showAll ? "chevron.up" : "chevron.down")
        }
        .buttonStyle(.borderless)
        .font(.callout)
      }
      if showAll {
        ScrollViewReader { proxy in
          ScrollView {
            FlowLayout(spacing: 6) {
              ForEach(Array(words.enumerated()), id: \.offset) { offset, word in
                chip(word.display, state: offset < index ? .done : offset == index ? .current : .pending).id(offset)
              }
            }
          }
          .frame(maxHeight: 180)
          .onAppear { proxy.scrollTo(index, anchor: .center) }
          .onChange(of: index) { proxy.scrollTo(index, anchor: .center) }
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 12)
  }

  private enum ChipState { case done, current, pending }

  private func chip(_ text: String, state: ChipState = .pending) -> some View {
    Text(text)
      .font(.footnote)
      .lineLimit(1)
      .padding(.horizontal, 10)
      .padding(.vertical, 4)
      .foregroundStyle(state == .current ? Color.white : state == .done ? Color.green : Color.secondary)
      .background(state == .current ? Color.accentColor : state == .done ? Color.green.opacity(0.15) : Color.clear, in: Capsule())
      .overlay(Capsule().strokeBorder(state == .pending ? Color.secondary.opacity(0.4) : Color.clear))
      .accessibilityLabel(text + (state == .done ? L("practice.upcoming.done") : state == .current ? L("practice.upcoming.current") : ""))
  }

  /// Shorter text gets the large size; anything over 24 characters wraps as a paragraph.
  private func wordFont(_ text: String) -> Font {
    let length = text.unicodeScalars.count
    let wide = sizeClass == .regular
    if length > 24 { return .system(size: wide ? 26 : 20, weight: .medium) }
    return .system(size: length > 10 ? (wide ? 44 : 32) : (wide ? 64 : 44), weight: .medium)
  }

  private func aside(_ list: WordList) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text(L("practice.aside.lists")).font(.headline)
          Spacer()
          Button { app.section = .lists } label: { Label(L("practice.aside.create"), systemImage: "plus") }.buttonStyle(.borderless)
        }
        ForEach(app.lists.prefix(8)) { item in
          Button { requestSwitch(item.id) } label: { ListOptionRow(list: item, selected: item.id == list.id) }
            .buttonStyle(.plain)
          if item.id != app.lists.prefix(8).last?.id { Divider() }
        }
        if app.lists.count > 8 {
          Button(L("practice.aside.allLists")) { pickerOpen = true }.buttonStyle(.borderless).font(.callout)
        }
      }
      .padding(16)
      .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .firstTextBaseline) {
          Text(L("practice.aside.best")).font(.headline)
          Text(list.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        let candidates = comparableRecords(list)
        Text(candidates.count < list.records.count ? L("practice.aside.bestOrderAtCount", list.words.count) : L("practice.aside.bestOrder"))
          .font(.caption).foregroundStyle(.secondary)
        BestRecordsView(records: candidates, highlightId: model.saveState == .saved ? model.record?.id : nil)
        Button {
          app.section = .rankings
        } label: {
          Label(L("practice.aside.allBest"), systemImage: "arrow.right")
        }
        .buttonStyle(.borderless)
        .font(.callout)
      }
      .padding(16)
      .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }
  }
}

/// Lays chips out in rows, wrapping to the next row when one is full.
struct FlowLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(subviews, width: proposal.width ?? .infinity)
    return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    for row in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
        x += size.width + spacing
      }
    }
  }

  private struct Row { var indices: [Int] = []; var y: CGFloat = 0; var width: CGFloat = 0; var height: CGFloat = 0 }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var row = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      if !row.indices.isEmpty && row.width + spacing + size.width > width {
        rows.append(row)
        row = Row(y: row.y + row.height + spacing)
      }
      row.width += (row.indices.isEmpty ? 0 : spacing) + size.width
      row.height = max(row.height, size.height)
      row.indices.append(index)
    }
    if !row.indices.isEmpty { rows.append(row) }
    return rows
  }
}
