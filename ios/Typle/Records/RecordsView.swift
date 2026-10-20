import SwiftUI
import TypleCore

/// Every record, newest first and grouped by day, filtered by list and device (src/app/(workspace)/records/page.tsx).
struct RecordsView: View {
  @Environment(AppModel.self) private var app
  @State private var listFilter: String?
  @State private var deviceFilter: String?
  @State private var deleting: RecordRow?
  @State private var message: String?
  @State private var failed = false

  var body: some View {
    let all = recordRows(app.lists)
    let rows = filterRows(all, list: listFilter, device: deviceFilter)
    let options = deviceOptions(all.filter { listFilter == nil || $0.list.id == listFilter }.map(\.record))
    PageScroll {
      PageHeader(title: L("records.title"), description: L("records.intro"))
      if let message {
        Label(message, systemImage: failed ? "exclamationmark.triangle" : "checkmark.circle")
          .font(.system(size: 14)).foregroundStyle(failed ? Palette.destructive : Palette.success)
      }
      if all.isEmpty {
        empty(title: L("records.empty.title"), description: L("records.empty.description"))
      } else {
        HStack(spacing: 8) {
          Menu {
            Picker(L("records.filter.list"), selection: $listFilter) {
              Text(L("records.filter.allLists")).tag(String?.none)
              ForEach(app.lists.filter { !$0.records.isEmpty }) { list in
                Text(L("records.filterMenu.option", list.name, list.records.count)).tag(String?.some(list.id))
              }
            }
          } label: {
            FilterLabel(name: L("records.filter.list"), value: listFilter.flatMap { id in app.lists.first { $0.id == id }?.name } ?? L("records.filterMenu.all"))
          }
          Menu {
            Picker(L("records.filter.device"), selection: $deviceFilter) {
              Text(L("records.filter.allDevices")).tag(String?.none)
              ForEach(options, id: \.value) { option in
                Text(L("records.filterMenu.option", option.value == noDevice ? L("format.noDeviceRecorded") : Format.device(option.device), option.count))
                  .tag(String?.some(option.value))
              }
            }
          } label: {
            FilterLabel(name: L("records.filter.device"), value: deviceFilter.map { value in
              value == noDevice ? L("format.noDeviceRecorded") : Format.device(options.first { $0.value == value }?.device)
            } ?? L("records.filterMenu.all"))
          }
          if listFilter != nil || deviceFilter != nil {
            Button(L("records.filter.clear")) { listFilter = nil; deviceFilter = nil }.buttonStyle(.typle(.ghost))
          }
          Spacer()
          Text(rows.count == all.count ? L("records.filter.count", all.count) : L("records.filter.filteredCount", rows.count, all.count))
            .font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
        }
        if rows.isEmpty {
          empty(title: L("records.filteredEmpty.title"), description: L("records.filteredEmpty.description"))
        } else {
          VStack(alignment: .leading, spacing: 12) {
            columns
            ForEach(groupByDay(rows), id: \.day) { group in
              VStack(alignment: .leading, spacing: 10) {
                HStack {
                  Text(dayHeading(group.day)).font(.system(size: 14, weight: .bold))
                  Spacer()
                  Text(L("records.day.summary", group.rows.count, Format.total(group.seconds))).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
                }
                .padding(.horizontal, 4)
                .padding(.top, 8)
                VStack(spacing: 0) {
                  ForEach(group.rows.indices, id: \.self) { index in
                    if index > 0 { Hairline() }
                    RecordRowView(row: group.rows[index], canDelete: app.store.canDeleteRecords) { deleting = group.rows[index] }
                  }
                }
                .card()
              }
            }
          }
          Text(L("records.note")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
        }
      }
    }
    .confirmationDialog(L("records.delete.title"), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                        titleVisibility: .visible, presenting: deleting) { row in
      Button(L("common.delete.confirm"), role: .destructive) { delete(row) }
    } message: { row in
      Text(L("records.delete.description", row.list.name) + "\n" + Format.date(row.record.date) + " · " + Format.duration(row.record.time))
    }
  }

  /// 「今日・10月20日（火）」 for today and yesterday, the date alone for other days.
  private func dayHeading(_ day: Date) -> String {
    switch dayKind(day) {
    case .today, .yesterday: return L("records.day.heading", Format.day(day), Format.dateWithWeekday(day))
    case .thisYear, .otherYear: return Format.dateWithWeekday(day)
    }
  }

  private var columns: some View {
    HStack(spacing: 16) {
      Text(L("records.columns.time")).frame(width: 52, alignment: .leading)
      Text(L("records.columns.listDevice")).frame(maxWidth: .infinity, alignment: .leading)
      Text(L("records.columns.duration")).frame(width: 90, alignment: .trailing)
      Text(L("records.columns.accuracy")).frame(width: 70, alignment: .trailing)
      Text(L("records.columns.perWord")).frame(width: 84, alignment: .trailing)
      Text(L("records.columns.mistakes")).frame(width: 44, alignment: .trailing)
      Color.clear.frame(width: 32, height: 1)
    }
    .font(.system(size: 12))
    .foregroundStyle(Palette.mutedForeground)
    .padding(.horizontal, 20)
  }

  private func empty(title: String, description: String) -> some View {
    VStack(spacing: 12) {
      IconTile(systemName: "clock.arrow.circlepath")
      Text(title).font(.system(size: 16, weight: .semibold))
      Text(description).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).multilineTextAlignment(.center)
      Button { app.navigate(.practice) } label: { Label(L("records.empty.practice"), systemImage: "keyboard") }.buttonStyle(.typle())
    }
    .frame(maxWidth: .infinity)
    .padding(40)
    .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
  }

  private func delete(_ row: RecordRow) {
    Task {
      do {
        try await app.deleteRecord(row.record, listId: row.list.id)
        failed = false
        message = L("records.delete.done", row.list.name, Format.date(row.record.date))
      } catch {
        failed = true
        message = errorText(error)
      }
    }
  }
}

/// One record as a row of the table (src/components/Records/RecordRow.tsx).
struct RecordRowView: View {
  var row: RecordRow
  var canDelete: Bool
  var onDelete: () -> Void

  var body: some View {
    let record = row.record
    HStack(spacing: 16) {
      Text(Format.time(record.date)).font(.system(size: 14)).monospacedDigit().foregroundStyle(Palette.mutedForeground).frame(width: 52, alignment: .leading)
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 8) {
          Text(row.list.name).font(.system(size: 16)).lineLimit(1)
          if row.best {
            Label(L("records.row.best"), systemImage: "trophy")
              .font(.system(size: 12, weight: .bold))
              .labelStyle(TightLabelStyle())
              .foregroundStyle(Palette.amber)
              .padding(.horizontal, 8)
              .frame(height: 22)
              .background(Palette.amberSoft, in: Capsule())
          }
        }
        Text([record.wordCount.map { L("records.row.words", $0) }, Format.device(record.device)].compactMap { $0 }.joined(separator: L("wordLists.row.separator")))
          .font(.system(size: 13)).foregroundStyle(Palette.mutedForeground).lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      HStack(alignment: .firstTextBaseline, spacing: 1) {
        ForEach(Array(Format.durationParts(record.time).enumerated()), id: \.offset) { _, part in
          Text(part.0).font(.system(size: 15, weight: .bold)).monospacedDigit()
          Text(part.1).font(.system(size: 11)).foregroundStyle(Palette.mutedForeground)
        }
      }
      .frame(width: 90, alignment: .trailing)
      Text(record.accuracy.map { "\(Format.number($0))%" } ?? "—").font(.system(size: 14)).monospacedDigit()
        .foregroundStyle(record.accuracy.map { $0 < lowAccuracy } ?? false ? Palette.destructive : Palette.foreground)
        .frame(width: 70, alignment: .trailing)
      HStack(alignment: .firstTextBaseline, spacing: 1) {
        if let perWord = secondsPerWord(record) {
          Text(Format.seconds(perWord)).font(.system(size: 14)).monospacedDigit()
          Text(L("records.row.perWordUnit")).font(.system(size: 11)).foregroundStyle(Palette.mutedForeground)
        } else {
          Text("—").font(.system(size: 14))
        }
      }
      .frame(width: 84, alignment: .trailing)
      Text(record.mistakes.map(String.init) ?? "—").font(.system(size: 14)).monospacedDigit().frame(width: 44, alignment: .trailing)
      Group {
        if canDelete {
          Button(action: onDelete) { Image(systemName: "trash").font(.system(size: 14)) }
            .buttonStyle(.typle(.ghost, size: .icon))
            .foregroundStyle(Palette.mutedForeground)
            .accessibilityLabel(L("records.row.deleteLabel", row.list.name, Format.date(record.date)))
        } else {
          Color.clear
        }
      }
      .frame(width: 32)
    }
    .padding(.horizontal, 20)
    .frame(minHeight: 68)
    .accessibilityElement(children: .combine)
  }
}
