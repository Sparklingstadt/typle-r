import SwiftUI
import TypleCore

/// Each list's personal best (src/app/(workspace)/rankings/page.tsx): the lists, and for a chosen list its figures,
/// time trend and top records. Rank 1 is the best every other screen shows.
struct RankingsView: View {
  @Environment(AppModel.self) private var app
  @State private var order = RankOrder.accuracy
  @State private var sort = ListSort.recent
  @State private var device: String?
  @State private var query = ""
  @State private var showAll = false

  var body: some View {
    let devices = deviceOptions(app.lists.flatMap(\.records))
    PageScroll(maxWidth: 1088) {
      PageHeader(title: L("rankings.title"), description: L("rankings.intro"))
      HStack(spacing: 10) {
        Menu {
          Picker(L("rankings.filter.device"), selection: $device) {
            Text(L("rankings.filter.allDevices")).tag(String?.none)
            ForEach(devices, id: \.value) { option in
              Text(option.value == noDevice ? L("format.noDeviceRecorded") : Format.device(option.device)).tag(String?.some(option.value))
            }
          }
        } label: {
          FilterLabel(name: L("rankings.filter.device"), value: device.map { value in
            value == noDevice ? L("format.noDeviceRecorded") : Format.device(devices.first { $0.value == value }?.device)
          } ?? L("records.filterMenu.all"))
        }
        SegmentedPills(options: [(RankOrder.accuracy, L("rankings.order.accuracy")), (RankOrder.speed, L("rankings.order.speed"))], selection: $order)
        HStack(spacing: 4) {
          Image(systemName: "info.circle").font(.system(size: 11))
          Text(L(order == .accuracy ? "rankings.orderNotes.accuracy" : "rankings.orderNotes.speed"))
        }
        .font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
      }
      if let id = app.rankingsList, let list = app.lists.first(where: { $0.id == id }) {
        detail(listRanking(list, device: device, order: order, includeOthers: showAll))
      } else {
        lists
      }
    }
  }

  // MARK: The lists

  private var lists: some View {
    let rankings = sortRankings(app.lists.map { listRanking($0, device: device, order: order) }, sort: sort, locale: Localization.locale)
      .filter { query.isEmpty || $0.list.name.lowercased().contains(query.trimmingCharacters(in: .whitespaces).lowercased()) }
    let practised = rankings.filter { !$0.records.isEmpty }
    let unpractised = rankings.filter { $0.records.isEmpty }
    return VStack(spacing: 0) {
      HStack(spacing: 12) {
        SearchField(prompt: L("rankings.list.search"), text: $query)
        Menu {
          Picker(L("rankings.list.sortLabel", ""), selection: $sort) {
            ForEach(ListSort.allCases, id: \.self) { sort in Text(L("rankings.list.sorts.\(sort.rawValue)")).tag(sort) }
          }
        } label: {
          HStack(spacing: 4) {
            Text(L("rankings.list.sorts.\(sort.rawValue)"))
            Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
          }
          .font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
        }
      }
      .padding(12)
      Hairline()
      ForEach(practised.indices, id: \.self) { index in
        if index > 0 { Hairline() }
        listRow(practised[index])
      }
      if !unpractised.isEmpty {
        Hairline()
        VStack(alignment: .leading, spacing: 0) {
          Text(device == nil ? L("rankings.list.noRecords", unpractised.count) : L("rankings.list.noDeviceRecords", unpractised.count))
            .font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 6)
          ForEach(unpractised) { ranking in
            Button { app.rankingsList = ranking.list.id } label: {
              HStack {
                Text(ranking.list.name).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
                Spacer()
                Text(L("rankings.list.words", ranking.list.words.count)).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
                Image(systemName: "chevron.right").font(.system(size: 11)).foregroundStyle(Palette.mutedForeground)
              }
              .padding(.horizontal, 16)
              .frame(height: 38)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.bottom, 8)
      }
      if rankings.isEmpty {
        Text(L("rankings.list.noMatch", query)).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).padding(16)
      }
    }
    .card()
  }

  private func listRow(_ ranking: ListRanking) -> some View {
    Button { app.rankingsList = ranking.list.id } label: {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(ranking.list.name).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.foreground)
          if let best = ranking.best {
            HStack(spacing: 8) {
              Image(systemName: "trophy").font(.system(size: 11)).foregroundStyle(Palette.amber)
              HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text(Format.seconds(best.time)).font(.system(size: 13, weight: .semibold)).monospacedDigit()
                Text(L("format.secondsUnit")).font(.system(size: 10)).foregroundStyle(Palette.mutedForeground)
              }
              Text(formatAccuracy(best.accuracy)).font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
              if ranking.improved {
                HStack(spacing: 2) {
                  Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 9))
                  Text(L("rankings.list.improved"))
                }
                .font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.success)
              }
            }
          }
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 3) {
          Text(ranking.lastPracticed.map { Format.day($0) } ?? "").font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
          Text(L("rankings.list.runs", ranking.records.count)).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
        }
        Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  // MARK: One list

  private func detail(_ ranking: ListRanking) -> some View {
    let stats = rankingStats(ranking.ranked)
    let shown = showAll ? ranking.ranked : Array(ranking.ranked.prefix(rankingTop))
    return VStack(alignment: .leading, spacing: 24) {
      Button { app.rankingsList = nil } label: {
        HStack(spacing: 6) { Image(systemName: "arrow.left").font(.system(size: 12)); Text(L("rankings.detail.back")) }
          .font(.system(size: 13, weight: .medium))
      }
      .buttonStyle(.plain)
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 6) {
          Text(ranking.list.name).font(.system(size: 22, weight: .bold))
          Text([L("rankings.detail.words", ranking.list.words.count), L("rankings.detail.records", ranking.records.count),
                ranking.lastPracticed.map { L("rankings.detail.lastPracticed", Format.day($0)) }].compactMap { $0 }.joined(separator: "  ·  "))
            .font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
        }
        Spacer()
        Button { app.navigate(.records) } label: {
          HStack(spacing: 6) { Text(L("rankings.detail.viewRecords")); Image(systemName: "arrow.right").font(.system(size: 11)) }
        }
        .buttonStyle(.typle(.ghost))
        Button { app.practice(listId: ranking.list.id) } label: { Label(L("rankings.detail.practice"), systemImage: "keyboard") }
          .buttonStyle(.typle())
      }
      if ranking.records.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text(L("rankings.detail.notPractised.title")).font(.system(size: 16, weight: .semibold))
          Text(L("rankings.detail.notPractised.description")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.muted.opacity(0.5), in: RoundedRectangle(cornerRadius: Radius.lg))
      } else {
        HStack(spacing: 12) {
          if let best = ranking.best {
            figure(L("rankings.detail.stats.best"), Format.seconds(best.time), unit: L("format.secondsUnit"),
                   note: L("rankings.detail.stats.bestNote", formatAccuracy(best.accuracy), parseDate(best.date).map { Format.day($0) } ?? ""), highlight: true)
          }
          figure(L("rankings.detail.stats.recentAverage", stats.recentCount), stats.recentTime.map(Format.seconds) ?? "—", unit: L("format.secondsUnit"),
                 note: stats.recentTime.flatMap { recent in ranking.best.map { recent - $0.time } }.map { $0 < 0.005 ? L("rankings.detail.stats.sameAsBest") : L("rankings.detail.stats.behindBest", Format.seconds($0)) } ?? "")
          figure(L("rankings.detail.stats.accuracy"), stats.recentAccuracy.map { String(format: "%.1f", $0) } ?? "—", unit: "%",
                 note: L("rankings.detail.stats.recent", stats.recentCount))
          figure(L("rankings.detail.stats.runs"), "\(ranking.ranked.count)", unit: L("rankings.detail.stats.runsUnit"),
                 note: L("rankings.detail.stats.atCount", ranking.list.words.count))
        }
        VStack(alignment: .leading, spacing: 10) {
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(L("rankings.detail.trend.title")).font(.system(size: 14, weight: .bold))
            Text(L("rankings.detail.trend.recent", stats.points.count)).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
          }
          if stats.points.count > 1 {
            TrendChart(points: stats.points.map { TrendPoint(date: $0.date, value: $0.value) }, scale: speedScale(stats.points.map { $0.value }))
              .padding(14)
              .background(Palette.muted.opacity(0.5), in: RoundedRectangle(cornerRadius: Radius.lg))
          } else {
            Text(L("rankings.detail.trend.needTwo")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
              .padding(14).frame(maxWidth: .infinity, alignment: .leading)
              .background(Palette.muted.opacity(0.5), in: RoundedRectangle(cornerRadius: Radius.lg))
          }
        }
        if ranking.fallback {
          Text(L("rankings.fallback", ranking.list.words.count)).font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
        }
        VStack(alignment: .leading, spacing: 4) {
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(L("rankings.detail.top.title")).font(.system(size: 14, weight: .bold))
            Text(L(order == .accuracy ? "rankings.detail.top.accuracy" : "rankings.detail.top.speed")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
            Spacer()
            Text(L("rankings.detail.top.shown", shown.count, ranking.ranked.count)).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
          }
          HStack(spacing: 12) {
            Text(L("rankings.detail.columns.rank")).frame(width: 36, alignment: .leading)
            Text(L("records.columns.duration")).frame(width: 130, alignment: .leading)
            Text(L("records.columns.accuracy")).frame(width: 70, alignment: .leading)
            Text(L("records.columns.mistakes")).frame(width: 46, alignment: .leading)
            Text(L("rankings.detail.columns.device")).frame(maxWidth: .infinity, alignment: .leading)
            Text(L("rankings.detail.columns.date")).frame(width: 110, alignment: .trailing)
          }
          .font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
          .padding(.horizontal, 8).padding(.vertical, 8)
          .hairline(.bottom)
          ForEach(shown.indices, id: \.self) { index in
            let record = shown[index]
            let recent = parseDate(record.date).map { Date().timeIntervalSince($0) < improvedDays * 86400 } ?? false
            HStack(spacing: 12) {
              RankBadge(rank: index + 1).frame(width: 36, alignment: .leading)
              HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text(Format.seconds(record.time)).font(.system(size: 14, weight: .semibold)).monospacedDigit()
                Text(L("format.secondsUnit")).font(.system(size: 10)).foregroundStyle(Palette.mutedForeground)
              }
              .frame(width: 130, alignment: .leading)
              Text(formatAccuracy(record.accuracy)).font(.system(size: 14)).monospacedDigit().frame(width: 70, alignment: .leading)
              Text(record.mistakes.map(String.init) ?? "—").font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).frame(width: 46, alignment: .leading)
              Text(Format.device(record.device)).font(.system(size: 14)).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
              Text(Format.date(record.date)).font(.system(size: 13, weight: recent ? .medium : .regular))
                .foregroundStyle(recent ? Palette.success : Palette.mutedForeground).frame(width: 110, alignment: .trailing)
            }
            .padding(.horizontal, 8)
            .frame(height: 44)
            .background(index == 0 ? Palette.amberSoft.opacity(0.4) : .clear)
          }
          if ranking.ranked.count > rankingTop {
            Button(showAll ? L("rankings.detail.top.showTop", rankingTop) : L("rankings.detail.top.showAll", ranking.ranked.count)) { showAll.toggle() }
              .buttonStyle(.typle(.ghost, size: .sm))
          }
        }
      }
    }
    .padding(24)
    .card()
  }

  private func figure(_ term: String, _ value: String, unit: String, note: String, highlight: Bool = false) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 4) {
        if highlight { Image(systemName: "trophy").font(.system(size: 11)).foregroundStyle(Palette.amber) }
        Text(term)
      }
      .font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
      ValueWithUnit(value: value, unit: unit, size: 24)
      Text(note).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground).lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .background(highlight ? Palette.amberSoft.opacity(0.35) : Palette.card, in: RoundedRectangle(cornerRadius: Radius.xl))
    .outlined(color: highlight ? Palette.amberBorder : Palette.border)
  }
}
