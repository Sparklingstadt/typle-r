import SwiftUI
import TypleCore

/// The practice screen (src/app/(workspace)/play/page.tsx): the practice card, and beside it (below when narrow) the
/// lists and the best records.
struct PracticeView: View {
  @Environment(AppModel.self) private var app
  @State private var model = PracticeModel()
  @State private var pickerOpen = false
  @State private var pendingSwitch: String?
  @State private var showAll = false
  @State private var inputFocused = false
  @State private var focusedOnce = false

  var body: some View {
    GeometryReader { proxy in
      ScrollView {
        Group {
          if let list = model.list(in: app.lists), !list.words.isEmpty {
            if proxy.size.width >= 900 {
              HStack(alignment: .top, spacing: 24) {
                card(list)
                aside(list).frame(width: 320)
              }
            } else {
              VStack(spacing: 24) {
                card(list)
                aside(list)
              }
            }
          } else {
            empty
          }
        }
        .frame(maxWidth: 1280)
        .padding(.horizontal, proxy.size.width >= 900 ? 48 : 20)
        .padding(.vertical, 32)
        .frame(maxWidth: .infinity)
      }
      .scrollDismissesKeyboard(.never)
      .background(Palette.page)
    }
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
    #if DEBUG
    .task {
      // Screenshots of a run in progress or finished: `-TypleTyping hogefx` types as if from the keyboard.
      guard let text = UserDefaults.standard.string(forKey: "TypleTyping"), let list = model.list(in: app.lists) else { return }
      try? await Task.sleep(for: .milliseconds(300))
      var typed = ""
      for character in text {
        typed.append(character)
        let index = model.session.index
        model.enter(typed, list: list, device: app.chosenPracticeDevice, app: app)
        // A finished word clears the field, so the next characters start a new input.
        if model.session.index != index || model.finished { typed = "" }
        try? await Task.sleep(for: .milliseconds(60))
      }
    }
    #endif
    .onChange(of: app.practiceRequest) { takeRequest() }
    // Another store has other lists; a run on a list that is gone cannot be saved.
    .onChange(of: app.store.accountId) { model.restart(listId: app.lists.first?.id) }
  }

  private var empty: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(L("practice.empty")).font(.system(size: 16))
      Button { app.navigate(.createList) } label: { Label(L("nav.links.create"), systemImage: "plus") }.buttonStyle(.typle())
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(32)
    .card()
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

  // MARK: The practice card

  private func card(_ list: WordList) -> some View {
    VStack(spacing: 0) {
      header(list)
      Hairline()
      progress(list.words.count)
      if model.finished {
        PracticeResultView(list: list, session: model.session, device: model.practiceDevice, record: model.record, saveState: model.saveState,
                           onRestart: { model.restart() }, onRetry: { model.retrySave(app: app) }, onChooseList: { pickerOpen = true })
      } else {
        practice(list)
      }
    }
    .frame(maxWidth: .infinity)
    .card()
  }

  private func header(_ list: WordList) -> some View {
    HStack(spacing: 8) {
      Button { pickerOpen = true } label: {
        HStack(spacing: 8) {
          Image(systemName: "list.bullet").font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
          Text(list.name).font(.system(size: 16, weight: .bold)).foregroundStyle(Palette.foreground).lineLimit(1)
          Text(L("practice.header.wordCount", list.words.count)).font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
          Image(systemName: "chevron.up.chevron.down").font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
        }
        .padding(.horizontal, 10)
        .frame(height: 40)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(L("practice.header.switchList", list.name))
      Spacer(minLength: 8)
      DeviceMenu(current: model.running ? model.practiceDevice : app.chosenPracticeDevice, locked: model.running)
      Button {
        app.setLiveStatsVisible(!app.liveStatsVisible)
        if !model.finished { model.focusRequest += 1 }
      } label: {
        Image(systemName: app.liveStatsVisible ? "eye" : "eye.slash").font(.system(size: 16))
      }
      .buttonStyle(.typle(.ghost, size: .iconLg))
      .accessibilityLabel(L("practice.header.liveStats"))
      .accessibilityValue(app.liveStatsVisible ? L("common.on") : L("common.off"))
      Button { model.restart() } label: {
        HStack(spacing: 8) {
          Label(L("practice.header.restartShort"), systemImage: "arrow.counterclockwise")
          Kbd(text: "Esc")
        }
      }
      .buttonStyle(.typle(.ghost, size: .lg))
      .accessibilityLabel(L("practice.header.restart"))
    }
    .padding(.horizontal, 12)
    .frame(height: 64)
  }

  private func progress(_ total: Int) -> some View {
    let done = model.finished ? total : model.session.index
    let current = model.finished ? total : model.session.index + 1
    return HStack(spacing: 12) {
      GeometryReader { proxy in
        ZStack(alignment: .leading) {
          Capsule().fill(Palette.muted)
          Capsule().fill(Palette.primary).frame(width: proxy.size.width * CGFloat(done) / CGFloat(max(total, 1)))
        }
      }
      .frame(height: 6)
      Text(L("practice.progress.value", current, total)).font(.system(size: 14, weight: .medium)).monospacedDigit()
    }
    .padding(.horizontal, 24)
    .padding(.top, 16)
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
        Text(word.annotation).font(.system(size: 16)).multilineTextAlignment(.center)
      }
      if word.display == word.input {
        TargetTextView(comparison: comparison, size: wordSize(word.display))
      } else {
        Text(word.display).font(.system(size: wordSize(word.display), weight: .medium)).multilineTextAlignment(.center)
        HStack(spacing: 10) {
          Text(L("practice.word.typeThis")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
            .padding(.horizontal, 8).frame(height: 22).overlay(Capsule().strokeBorder(Palette.border))
          TargetTextView(comparison: comparison, size: 30).fixedSize()
        }
      }
    }
    .frame(maxWidth: .infinity, minHeight: 208)
    .padding(.horizontal, 24)
    .padding(.top, 32)
    .overlay {
      if showResume {
        Button { model.focusRequest += 1 } label: {
          Label(L("practice.word.resume"), systemImage: "hand.tap")
            .font(.system(size: 14, weight: .medium))
            .labelStyle(TightLabelStyle())
            .foregroundStyle(Palette.primaryForeground)
            .padding(.horizontal, 16)
            .frame(height: 40)
            .background(Palette.primary, in: Capsule())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.card.opacity(0.7))
        .background(.ultraThinMaterial)
      }
    }
    VStack(spacing: 10) {
      let invalid = comparison.errorIndex != nil
      PracticeTextField(
        text: session.input, placeholder: L("practice.word.placeholder"),
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
        .frame(height: 56)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.lg))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(invalid ? Palette.destructive : inputFocused ? Palette.primary : Palette.input, lineWidth: 2))
        .overlay(
          RoundedRectangle(cornerRadius: Radius.lg + 4)
            .strokeBorder(invalid ? Palette.destructive.opacity(0.2) : Palette.ring.opacity(inputFocused ? 0.35 : 0), lineWidth: 4)
            .padding(-4)
        )
        .frame(maxWidth: 440)
      feedback(comparison)
    }
    .padding(.horizontal, 24)
    .padding(.top, 8)
    .padding(.bottom, 20)
    if app.liveStatsVisible {
      LiveStatsView(session: session).padding(.horizontal, 24).padding(.bottom, 20)
    }
    Hairline()
    upcoming(words, index: session.index)
  }

  @ViewBuilder
  private func feedback(_ comparison: InputComparison) -> some View {
    Group {
      if let errorIndex = comparison.errorIndex {
        Label(L("practice.feedback.mismatch", errorIndex + 1), systemImage: "exclamationmark.circle")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(Palette.destructive)
      } else if model.composing {
        Text(L("practice.feedback.composing"))
      } else {
        HStack(spacing: 16) {
          HStack(spacing: 6) { Kbd(text: "Backspace"); Text(L("practice.feedback.backspace")) }
          HStack(spacing: 6) { Kbd(text: "Esc"); Text(L("practice.feedback.restart")) }
        }
      }
    }
    .labelStyle(TightLabelStyle())
    .font(.system(size: 12))
    .foregroundStyle(Palette.mutedForeground)
    .frame(minHeight: 20)
    .accessibilityAddTraits(.updatesFrequently)
  }

  private func upcoming(_ words: [Word], index: Int) -> some View {
    let next = Array(words.dropFirst(index + 1).prefix(3))
    let remaining = words.count - index - 1 - next.count
    return VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Text(L("practice.upcoming.next")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
        ForEach(next.indices, id: \.self) { chip(next[$0].display) }
        if next.isEmpty { Text(L("practice.upcoming.last")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground) }
        if remaining > 0 { Text(L("practice.upcoming.more", remaining)).font(.system(size: 12)).foregroundStyle(Palette.pending) }
        Spacer(minLength: 0)
        Button {
          showAll.toggle()
          model.focusRequest += 1
        } label: {
          HStack(spacing: 6) {
            Text(L("practice.upcoming.showAll"))
            Image(systemName: showAll ? "chevron.up" : "chevron.down").font(.system(size: 11, weight: .semibold))
          }
        }
        .buttonStyle(.typle(.ghost, size: .lg))
      }
      if showAll {
        ScrollViewReader { proxy in
          ScrollView {
            FlowLayout(spacing: 6, lineSpacing: 6, alignment: .leading) {
              ForEach(words.indices, id: \.self) { offset in
                chip(words[offset].display, state: offset < index ? .done : offset == index ? .current : .pending).id(offset)
              }
            }
            .padding(.vertical, 10)
          }
          .frame(maxHeight: 176)
          .overlay(alignment: .top) {
            Rectangle().stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 3])).foregroundStyle(Palette.border).frame(height: 1)
          }
          .onAppear { proxy.scrollTo(index, anchor: .center) }
          .onChange(of: index) { proxy.scrollTo(index, anchor: .center) }
        }
      }
    }
    .padding(.leading, 24)
    .padding(.trailing, 12)
    .padding(.vertical, 10)
    .frame(minHeight: 56)
  }

  private enum ChipState { case done, current, pending }

  private func chip(_ text: String, state: ChipState = .pending) -> some View {
    Text(text)
      .font(.system(size: 13))
      .lineLimit(1)
      .padding(.horizontal, 12)
      .frame(height: 28)
      .foregroundStyle(state == .current ? Palette.primaryForeground : state == .done ? Palette.success : Palette.mutedForeground)
      .background(state == .current ? Palette.primary : state == .done ? Palette.successSoft : .clear, in: Capsule())
      .overlay(Capsule().strokeBorder(state == .pending ? Palette.border : .clear))
      .accessibilityLabel(text + (state == .done ? L("practice.upcoming.done") : state == .current ? L("practice.upcoming.current") : ""))
  }

  /// Shorter text gets the large size; anything over 24 characters gets a paragraph size.
  private func wordSize(_ text: String) -> CGFloat {
    let length = text.unicodeScalars.count
    if length > 24 { return 26 }
    return length > 10 ? 44 : 64
  }

  // MARK: Beside the card

  private func aside(_ list: WordList) -> some View {
    VStack(alignment: .leading, spacing: 24) {
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Text(L("practice.aside.lists")).font(.system(size: 15, weight: .bold))
          Spacer()
          Button { app.navigate(.createList) } label: { Label(L("practice.aside.create"), systemImage: "plus") }
            .buttonStyle(.typle(.ghost, size: .lg))
        }
        .padding(.leading, 8)
        ForEach(app.lists.prefix(8)) { item in
          Button { requestSwitch(item.id) } label: { ListOptionRow(list: item, selected: item.id == list.id) }
            .buttonStyle(.plain)
        }
        if app.lists.count > 8 {
          Button(L("practice.aside.allLists")) { pickerOpen = true }.buttonStyle(.typle(.ghost))
        }
      }
      .padding(12)
      .card()
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          Text(L("practice.aside.best")).font(.system(size: 15, weight: .bold))
          Text(list.name).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground).lineLimit(1)
        }
        let candidates = comparableRecords(list)
        Text(candidates.count < list.records.count ? L("practice.aside.bestOrderAtCount", list.words.count) : L("practice.aside.bestOrder"))
          .font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
        BestRecordsView(records: candidates, highlightId: model.saveState == .saved ? model.record?.id : nil)
        Button { app.showRankings(listId: list.id) } label: {
          HStack(spacing: 4) { Text(L("practice.aside.allBest")); Image(systemName: "arrow.right").font(.system(size: 11)) }
            .font(.system(size: 13, weight: .medium))
        }
        .buttonStyle(.typle(.ghost, size: .sm))
      }
      .padding(16)
      .card()
    }
  }
}
