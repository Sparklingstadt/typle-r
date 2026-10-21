import SwiftUI
import TypleCore

/// The home dashboard (src/components/Dashboard/Dashboard.tsx): this week's summary, lists to practise next and each
/// list's trend. With no records yet it shows how to start instead.
struct HomeView: View {
  @Environment(AppModel.self) private var app
  @State private var now = Date()

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 44) {
        if app.lists.contains(where: { !$0.records.isEmpty }) { dashboard } else { welcome }
      }
      .padding(.horizontal, 64)
      .padding(.vertical, 56)
      .frame(maxWidth: 1280, alignment: .leading)
      .card()
      .padding(.horizontal, 48)
      .padding(.vertical, 32)
      .frame(maxWidth: .infinity)
    }
    .background(Palette.page)
  }

  private var welcome: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(L("home.welcomeTitle")).font(.system(size: 30, weight: .regular))
      Text(L("home.welcomeDescription")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
      startButtons
    }
  }

  private var startButtons: some View {
    HStack(spacing: 12) {
      Button { app.navigate(.practice) } label: { Label(L("dashboard.practice"), systemImage: "keyboard") }.buttonStyle(.typle(.primary, size: .lg))
      Button { app.navigate(.createList) } label: { Label(L("dashboard.create"), systemImage: "plus") }.buttonStyle(.typle(.outline, size: .lg))
    }
  }

  @ViewBuilder
  private var dashboard: some View {
    let summary = summarize(app.lists, now: now)
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 8) {
        Text(L("dashboard.title")).font(.system(size: 30, weight: .regular))
        Text(app.storage == .account ? L("dashboard.sourceAccount") : L("dashboard.sourceLocal")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
      }
      startButtons
    }
    section(L("dashboard.week.title"), L("dashboard.week.description", Format.dateWithWeekday(summary.weekStart),
                                          Format.dateWithWeekday(Calendar.current.date(byAdding: .day, value: 6, to: summary.weekStart)!))) {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)], spacing: 16) {
        stat(L("dashboard.week.count"), [("\(summary.weekCount)", L("dashboard.week.countUnit"))],
             weekDelta(summary.weekCount, summary.previousWeekCount) { L("dashboard.week.times", Int($0)) })
        stat(L("dashboard.week.streak"), [("\(summary.streak)", L("dashboard.week.streakUnit"))], summary.practicedToday
             ? Delta(icon: "checkmark", good: true, text: L("dashboard.week.practisedToday"))
             : Delta(icon: "keyboard", good: false, text: L("dashboard.week.streakNext", summary.streak + 1)))
        stat(L("dashboard.week.accuracy", summary.accuracy?.recentCount ?? 10),
             summary.accuracy.map { [(String(format: "%.1f", $0.recent), "%")] } ?? [("—", "")],
             summary.accuracy?.change.map { changeDelta($0, lowerIsBetter: false, describe: pointDifference, namedRecent: false) }
               ?? Delta(icon: "minus", good: false, text: L(summary.accuracy == nil ? "dashboard.week.noAccuracy" : "dashboard.week.noComparison")))
        stat(L("dashboard.week.time"), Format.totalParts(summary.weekSeconds),
             weekDelta(Int(summary.weekSeconds.rounded()), Int(summary.previousWeekSeconds.rounded())) { Format.total(Double($0)) })
      }
    }
    section(L("dashboard.next.title"), L("dashboard.next.description", staleDays, Int(lowAccuracy))) {
      nextLists
    }
    section(L("dashboard.trends.title"), L("dashboard.trends.description")) {
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 16, alignment: .top), GridItem(.flexible(), spacing: 16, alignment: .top)], alignment: .leading, spacing: 16) {
        ForEach(listTrends(app.lists)) { trend in TrendCard(trend: trend, now: now) }
      }
    }
  }

  private func section<Content: View>(_ title: String, _ description: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.system(size: 20)).accessibilityAddTraits(.isHeader)
        Text(description).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).fixedSize(horizontal: false, vertical: true)
      }
      content()
    }
  }

  private func stat(_ label: String, _ parts: [(String, String)], _ delta: Delta) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(label).font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
      HStack(alignment: .firstTextBaseline, spacing: 2) {
        ForEach(parts.indices, id: \.self) { index in
          Text(parts[index].0).font(.system(size: 26, weight: .semibold)).monospacedDigit()
          Text(parts[index].1).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).padding(.trailing, 4)
        }
      }
      DeltaText(delta: delta)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .outlined()
    .accessibilityElement(children: .combine)
  }

  private var nextLists: some View {
    let items = TypleCore.nextLists(app.lists, now: now)
    return Group {
      if items.isEmpty {
        Text(L("dashboard.next.allPractised")).font(.system(size: 14)).padding(16).frame(maxWidth: .infinity, alignment: .leading).outlined()
      } else {
        VStack(spacing: 0) {
          ForEach(items.indices, id: \.self) { index in
            if index > 0 { Hairline() }
            nextRow(items[index])
          }
        }
        .outlined()
      }
    }
  }

  private func nextRow(_ item: NextList) -> some View {
    let badge: (String, String) = {
      switch item.reason {
      case .new: return ("sparkles", L("dashboard.next.new"))
      case .stale(let days): return ("clock", L("dashboard.next.stale", days))
      case .accuracy(let accuracy, let count): return ("target", L("dashboard.next.lowAccuracy", count, String(format: "%.1f", accuracy)))
      }
    }()
    return HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 2) {
        Text(item.list.name).font(.system(size: 16, weight: .medium))
        Text(L("dashboard.next.words", item.list.words.count) + " · " + (item.lastPracticed.map { L("dashboard.next.lastPracticed", Format.day($0, now: now)) } ?? L("dashboard.next.noRecords")))
          .font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
      }
      Spacer(minLength: 0)
      Pill(height: 24) {
        Image(systemName: badge.0).font(.system(size: 10))
        Text(badge.1)
      }
      Button(L("dashboard.next.practice")) { app.practice(listId: item.list.id) }.buttonStyle(.typle(.outline, size: .lg))
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 16)
  }

  private func weekDelta(_ current: Int, _ previous: Int, format: (Int) -> String) -> Delta {
    if current == previous { return Delta(icon: "minus", good: false, text: L("dashboard.week.sameAsLastWeek")) }
    let more = current > previous
    return Delta(icon: more ? "chart.line.uptrend.xyaxis" : "chart.line.downtrend.xyaxis", good: more,
                 text: L(more ? "dashboard.week.moreThanLastWeek" : "dashboard.week.lessThanLastWeek", format(abs(current - previous))))
  }
}

struct Delta {
  var icon: String
  var good: Bool
  var text: String
}

struct DeltaText: View {
  var delta: Delta
  var body: some View {
    HStack(alignment: .top, spacing: 4) {
      Image(systemName: delta.icon).font(.system(size: 10)).padding(.top, 2)
      Text(delta.text).fixedSize(horizontal: false, vertical: true)
    }
    .font(.system(size: 12))
    .foregroundStyle(delta.good ? Palette.success : Palette.mutedForeground)
  }
}

private func secondsDifference(_ difference: Double) -> String? {
  let value = String(format: "%.2f", abs(difference))
  return value == "0.00" ? nil : L(difference > 0 ? "dashboard.change.slower" : "dashboard.change.faster", value)
}

private func pointDifference(_ difference: Double) -> String? {
  let value = String(format: "%.1f", abs(difference))
  return value == "0.0" ? nil : L(difference > 0 ? "dashboard.change.pointsUp" : "dashboard.change.pointsDown", value)
}

/// 「直近5回の平均は、その前の5回より 0.12 秒速い」, or without the recent window when the label already names it.
private func changeDelta(_ change: Change, lowerIsBetter: Bool, describe: (Double) -> String?, namedRecent: Bool = true) -> Delta {
  let recent = !namedRecent ? "" : change.recentCount == 1 ? L("dashboard.change.latest") : L("dashboard.change.recentAverage", change.recentCount)
  let previous = change.previousCount == 1 ? L("dashboard.change.previousLatest") : L("dashboard.change.previousAverage", change.previousCount)
  let difference = change.recent - change.previous
  guard let text = describe(difference) else {
    return Delta(icon: "minus", good: false, text: capitalizedFirst(L("dashboard.change.same", recent, previous)))
  }
  return Delta(icon: difference > 0 ? "chart.line.uptrend.xyaxis" : "chart.line.downtrend.xyaxis", good: (difference > 0) != lowerIsBetter,
               text: capitalizedFirst(L("dashboard.change.different", recent, previous, text)))
}

/// English sentences that start with a part left out still start with a capital.
private func capitalizedFirst(_ text: String) -> String {
  text.prefix(1).uppercased() + text.dropFirst()
}

/// One list's speed and accuracy over its latest runs.
private struct TrendCard: View {
  @Environment(AppModel.self) private var app
  var trend: ListTrend
  var now: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      HStack(alignment: .firstTextBaseline) {
        Text(trend.list.name).font(.system(size: 16, weight: .medium))
        Spacer()
        Text(L("dashboard.trends.summary", trend.count, Format.day(trend.lastPracticed, now: now))).font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
      }
      if trend.count < 2 {
        Text(L("dashboard.trends.needTwo")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
        Button { app.practice(listId: trend.list.id) } label: { Label(L("dashboard.trends.practice"), systemImage: "keyboard") }
          .buttonStyle(.typle(.outline))
      } else {
        metric(L("dashboard.trends.speed"), trend.speed, scale: trend.speed.points.count > 1 ? speedScale(trend.speed.points.map(\.value)) : nil,
               format: { L("dashboard.trends.seconds", String(format: "%.2f", $0)) }, lowerIsBetter: true, describe: secondsDifference)
        metric(L("dashboard.trends.accuracy"), trend.accuracy, scale: trend.accuracy.points.count > 1 ? accuracyScale(trend.accuracy.points.map(\.value)) : nil,
               format: { String(format: "%.1f%%", $0) }, lowerIsBetter: false, describe: pointDifference)
        Text(L("dashboard.trends.best", trend.best.accuracy.map { "\(Format.number($0, digits: 2))%" } ?? L("dashboard.trends.notRecorded"),
               Format.seconds(trend.best.time), Format.day(parseDate(trend.best.date) ?? now, now: now)))
          .font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
          .padding(.top, 12)
          .frame(maxWidth: .infinity, alignment: .leading)
          .hairline(.top)
      }
    }
    .padding(20)
    .outlined()
  }

  private func metric(_ title: String, _ trend: Trend, scale: Scale?, format: @escaping (Double) -> String, lowerIsBetter: Bool,
                      describe: (Double) -> String?) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Text(title).font(.system(size: 13)).foregroundStyle(Palette.mutedForeground)
        Spacer()
        if let latest = trend.points.last {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(L("dashboard.trends.latest")).font(.system(size: 12)).foregroundStyle(Palette.mutedForeground)
            Text(format(latest.value)).font(.system(size: 16, weight: .semibold))
          }
        }
      }
      if let change = trend.change { DeltaText(delta: changeDelta(change, lowerIsBetter: lowerIsBetter, describe: describe)) }
      if let scale {
        TrendChart(points: trend.points, scale: scale)
      } else {
        Text(L("dashboard.trends.noChart")).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
      }
    }
  }
}

/// The web app's line chart (src/components/Dashboard/TrendChart.tsx): three gridlines, the line with a soft fill and
/// a dot on the latest point.
struct TrendChart: View {
  var points: [TrendPoint]
  var scale: Scale
  var height: CGFloat = 72

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 6) {
        GeometryReader { proxy in
          ZStack(alignment: .topTrailing) {
            ForEach(scale.ticks.indices, id: \.self) { index in
              Text(String(format: "%.\(scale.decimals)f", scale.ticks[index]))
                .font(.system(size: 11)).monospacedDigit().foregroundStyle(Palette.mutedForeground)
                .position(x: proxy.size.width / 2, y: y(scale.ticks[index], proxy.size.height))
            }
          }
        }
        .frame(width: 32)
        GeometryReader { proxy in
          let size = proxy.size
          ZStack {
            ForEach(scale.ticks.indices, id: \.self) { index in
              Path { path in
                let y = y(scale.ticks[index], size.height)
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
              }
              .stroke(Palette.border, lineWidth: 1)
            }
            area(size).fill(Palette.trend.opacity(0.1))
            line(size).stroke(Palette.trend, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            if let last = points.last {
              Circle().fill(Palette.trend).frame(width: 10, height: 10)
                .overlay(Circle().strokeBorder(Palette.card, lineWidth: 2))
                .position(x: size.width, y: y(last.value, size.height))
            }
          }
        }
        .padding(.horizontal, 4)
      }
      .frame(height: height)
      .padding(.vertical, 8)
      HStack {
        Text(shortDate(points.first?.date))
        Spacer()
        Text(shortDate(points.last?.date))
      }
      .font(.system(size: 11)).monospacedDigit().foregroundStyle(Palette.mutedForeground)
      .padding(.leading, 40)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(points.map { "\(shortDate($0.date)) \(Format.number($0.value, digits: 2))" }.joined(separator: ", "))
  }

  private func shortDate(_ value: String?) -> String {
    guard let value, let date = parseDate(value) else { return "" }
    return date.formatted(.dateTime.month(.defaultDigits).day().locale(Localization.locale))
  }

  private func x(_ index: Int, _ width: CGFloat) -> CGFloat {
    points.count > 1 ? CGFloat(index) / CGFloat(points.count - 1) * width : width / 2
  }

  private func y(_ value: Double, _ height: CGFloat) -> CGFloat {
    let (low, high) = scale.domain
    return (1 - CGFloat((value - low) / max(high - low, 0.000001))) * height
  }

  private func line(_ size: CGSize) -> Path {
    Path { path in
      for (index, point) in points.enumerated() {
        let p = CGPoint(x: x(index, size.width), y: y(point.value, size.height))
        if index == 0 { path.move(to: p) } else { path.addLine(to: p) }
      }
    }
  }

  private func area(_ size: CGSize) -> Path {
    var path = line(size)
    path.addLine(to: CGPoint(x: x(points.count - 1, size.width), y: size.height))
    path.addLine(to: CGPoint(x: 0, y: size.height))
    path.closeSubpath()
    return path
  }
}
