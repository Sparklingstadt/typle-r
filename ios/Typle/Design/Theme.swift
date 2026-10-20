import SwiftUI
import UIKit

/// The web app's design tokens (src/app/globals.css, shadcn's neutral theme), as colours that follow light and dark.
enum Palette {
  private static func color(_ light: UInt32, _ dark: UInt32, darkAlpha: CGFloat = 1) -> Color {
    Color(UIColor { traits in
      traits.userInterfaceStyle == .dark ? UIColor(hex: dark, alpha: darkAlpha) : UIColor(hex: light)
    })
  }

  /// The top bar and the sidebar.
  static let background = color(0xFFFFFF, 0x0A0A0A)
  /// Behind the cards of a page.
  static let page = color(0xFAFAFA, 0x1A1A1A)
  static let card = color(0xFFFFFF, 0x171717)
  static let foreground = color(0x0A0A0A, 0xFAFAFA)
  static let primary = color(0x171717, 0xE5E5E5)
  static let primaryForeground = color(0xFAFAFA, 0x171717)
  static let muted = color(0xF5F5F5, 0x262626)
  static let mutedForeground = color(0x737373, 0xA1A1A1)
  static let accent = color(0xF5F5F5, 0x262626)
  static let border = color(0xE5E5E5, 0xFFFFFF, darkAlpha: 0.1)
  static let input = color(0xE5E5E5, 0xFFFFFF, darkAlpha: 0.15)
  static let ring = color(0xA1A1A1, 0x737373)
  static let destructive = color(0xE7000B, 0xFF6467)
  static let destructiveSoft = color(0xFEE2E2, 0x460809)
  /// Tailwind's green-700 / green-400, for good news.
  static let success = color(0x008236, 0x05DF72)
  static let successSoft = color(0xDCFCE7, 0x032E15)
  /// Tailwind's amber-100 / amber-950 behind a best record, with amber-800 / amber-300 text.
  static let amberSoft = color(0xFEF3C6, 0x461901)
  static let amber = color(0x973C00, 0xFFD230)
  static let amberBorder = color(0xFEE685, 0x7B3306)
  static let trend = color(0x2A78D6, 0x3987E5)
  static let pending = color(0xA1A1A1, 0x737373)
}

extension UIColor {
  convenience init(hex: UInt32, alpha: CGFloat = 1) {
    self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
  }
}

/// Corner radii of `--radius` (10px) and its steps.
enum Radius {
  static let sm: CGFloat = 6
  static let md: CGFloat = 8
  static let lg: CGFloat = 10
  static let xl: CGFloat = 14
}

// MARK: Surfaces

extension View {
  /// shadcn's Card: the card colour, a hairline border and the xl radius.
  func card(radius: CGFloat = Radius.xl) -> some View {
    background(Palette.card, in: RoundedRectangle(cornerRadius: radius))
      .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Palette.border))
  }

  /// A bordered box without a fill, like `ring-1 ring-foreground/10`.
  func outlined(radius: CGFloat = Radius.xl, color: Color = Palette.border) -> some View {
    overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(color))
  }

  func hairline(_ edge: Edge) -> some View {
    overlay(alignment: edge == .top ? .top : edge == .bottom ? .bottom : edge == .leading ? .leading : .trailing) {
      if edge == .top || edge == .bottom {
        Rectangle().fill(Palette.border).frame(height: 1)
      } else {
        Rectangle().fill(Palette.border).frame(width: 1)
      }
    }
  }
}

/// A full-width hairline, the web's `border-t` between sections.
struct Hairline: View {
  var body: some View { Rectangle().fill(Palette.border).frame(height: 1) }
}

// MARK: Buttons

/// shadcn's Button variants and sizes.
struct TypleButtonStyle: ButtonStyle {
  enum Variant { case primary, outline, ghost, secondary, destructive }
  enum Size { case sm, regular, lg, icon, iconLg }

  var variant: Variant = .primary
  var size: Size = .regular
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: size == .sm ? 13 : 14, weight: .medium))
      .labelStyle(TightLabelStyle())
      .foregroundStyle(foreground)
      .padding(.horizontal, horizontalPadding)
      .frame(minWidth: isIcon ? height : nil, minHeight: height)
      .background(background(pressed: configuration.isPressed), in: RoundedRectangle(cornerRadius: Radius.md))
      .overlay {
        if variant == .outline { RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Palette.border) }
      }
      .contentShape(RoundedRectangle(cornerRadius: Radius.md))
      .opacity(enabled ? 1 : 0.5)
  }

  private var isIcon: Bool { size == .icon || size == .iconLg }
  private var height: CGFloat {
    switch size {
    case .sm: return 32
    case .regular, .icon: return 36
    case .lg, .iconLg: return 40
    }
  }
  private var horizontalPadding: CGFloat { isIcon ? 0 : size == .sm ? 10 : size == .lg ? 16 : 12 }

  private var foreground: Color {
    switch variant {
    case .primary: return Palette.primaryForeground
    case .destructive: return .white
    default: return Palette.foreground
    }
  }

  private func background(pressed: Bool) -> Color {
    switch variant {
    case .primary: return pressed ? Palette.primary.opacity(0.85) : Palette.primary
    case .destructive: return pressed ? Palette.destructive.opacity(0.85) : Palette.destructive
    case .secondary: return Palette.muted
    case .outline: return pressed ? Palette.accent : Palette.card
    case .ghost: return pressed ? Palette.accent : .clear
    }
  }
}

extension ButtonStyle where Self == TypleButtonStyle {
  static func typle(_ variant: TypleButtonStyle.Variant = .primary, size: TypleButtonStyle.Size = .regular) -> TypleButtonStyle {
    TypleButtonStyle(variant: variant, size: size)
  }
}

/// An icon and its title with the web's 6–8px gap.
struct TightLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 6) {
      configuration.icon.imageScale(.small)
      configuration.title
    }
  }
}

// MARK: Small parts

/// A keyboard key, like the web's <Kbd>.
struct Kbd: View {
  var text: String
  var body: some View {
    Text(text)
      .font(.system(size: 11, weight: .medium))
      .foregroundStyle(Palette.mutedForeground)
      .padding(.horizontal, 5)
      .frame(minHeight: 20)
      .background(Palette.muted, in: RoundedRectangle(cornerRadius: 4))
      .outlined(radius: 4)
  }
}

/// A rounded-full chip with a hairline border: the storage badges and filters.
struct Pill<Content: View>: View {
  var height: CGFloat = 28
  var fill: Color = Palette.card
  @ViewBuilder var content: Content

  var body: some View {
    HStack(spacing: 6) { content }
      .font(.system(size: 12, weight: .medium))
      .padding(.horizontal, 10)
      .frame(height: height)
      .background(fill, in: Capsule())
      .overlay(Capsule().strokeBorder(Palette.border))
  }
}

/// shadcn's secondary Badge, such as the 3 / 100 next to a heading.
struct CountBadge: View {
  var text: String
  var body: some View {
    Text(text)
      .font(.system(size: 12, weight: .medium))
      .monospacedDigit()
      .padding(.horizontal, 8)
      .frame(height: 22)
      .background(Palette.muted, in: Capsule())
  }
}

/// Where the data is saved, as in the top bar and beside page headings (StorageBadge, PageStorageBadge).
struct StorageBadge: View {
  @Environment(AppModel.self) private var app
  var body: some View {
    Pill {
      Image(systemName: app.storage == .api ? "cloud" : "internaldrive").font(.system(size: 11)).foregroundStyle(Palette.mutedForeground)
      Text(app.storage == .api ? L("storage.account") : L("storage.local")).foregroundStyle(Palette.foreground.opacity(0.7))
    }
    .accessibilityElement(children: .combine)
  }
}

/// A page's heading and description, with the storage badge on the right like the web pages.
struct PageHeader<Trailing: View>: View {
  var title: String
  var description: String?
  @ViewBuilder var trailing: Trailing

  var body: some View {
    HStack(alignment: .bottom, spacing: 16) {
      VStack(alignment: .leading, spacing: 6) {
        Text(title).font(.system(size: 26, weight: .bold)).foregroundStyle(Palette.foreground)
        if let description {
          Text(description).font(.system(size: 14)).foregroundStyle(Palette.mutedForeground).fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
      trailing
    }
  }
}

extension PageHeader where Trailing == StorageBadge {
  init(title: String, description: String? = nil) {
    self.init(title: title, description: description) { StorageBadge() }
  }
}

/// A search box with a magnifier, like the web's list and ranking searches.
struct SearchField: View {
  var prompt: String
  @Binding var text: String

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass").font(.system(size: 14)).foregroundStyle(Palette.mutedForeground)
      TextField(prompt, text: $text)
        .font(.system(size: 14))
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      if !text.isEmpty {
        Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.mutedForeground) }
          .buttonStyle(.plain)
          .accessibilityLabel(L("common.clearSearch"))
      }
    }
    .padding(.horizontal, 12)
    .frame(height: 40)
    .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.md))
    .outlined(radius: Radius.md, color: Palette.input)
  }
}

/// A text field with shadcn's Input look.
struct InputBox: View {
  var placeholder: String
  @Binding var text: String
  var invalid = false
  var height: CGFloat = 40

  var body: some View {
    TextField(placeholder, text: $text)
      .font(.system(size: 14))
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .padding(.horizontal, 12)
      .frame(minHeight: height)
      .background(Palette.card, in: RoundedRectangle(cornerRadius: Radius.md))
      .outlined(radius: Radius.md, color: invalid ? Palette.destructive : Palette.input)
  }
}

/// A rounded-full filter button showing its name and value, like 「リスト すべて ⌄」.
struct FilterLabel: View {
  var name: String
  var value: String

  var body: some View {
    HStack(spacing: 6) {
      Text(name).foregroundStyle(Palette.mutedForeground)
      Text(value).foregroundStyle(Palette.foreground).fontWeight(.medium).lineLimit(1)
      Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(Palette.mutedForeground)
    }
    .font(.system(size: 14))
    .padding(.horizontal, 14)
    .frame(height: 36)
    .background(Palette.card, in: Capsule())
    .overlay(Capsule().strokeBorder(Palette.border))
  }
}

/// Two or more choices on a muted track, the selected one raised (the web's ToggleGroup).
struct SegmentedPills<Value: Hashable>: View {
  var options: [(Value, String)]
  @Binding var selection: Value

  var body: some View {
    HStack(spacing: 2) {
      ForEach(options.indices, id: \.self) { index in
        let value = options[index].0
        Button { selection = value } label: {
          Text(options[index].1)
            .font(.system(size: 13, weight: selection == value ? .semibold : .regular))
            .foregroundStyle(selection == value ? Palette.foreground : Palette.mutedForeground)
            .padding(.horizontal, 14)
            .frame(height: 30)
            .background(selection == value ? Palette.card : .clear, in: Capsule())
            .shadow(color: .black.opacity(selection == value ? 0.08 : 0), radius: 1, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selection == value ? .isSelected : [])
      }
    }
    .padding(3)
    .background(Palette.muted, in: Capsule())
    .outlined(radius: 20)
  }
}

/// A round icon tile, like the monitor and language icons on the devices and settings cards.
struct IconTile: View {
  var systemName: String
  var size: CGFloat = 40
  var body: some View {
    Image(systemName: systemName)
      .font(.system(size: size * 0.42))
      .foregroundStyle(Palette.foreground.opacity(0.8))
      .frame(width: size, height: size)
      .background(Palette.muted, in: RoundedRectangle(cornerRadius: Radius.lg))
  }
}

/// The yellow rank circle of a best record.
struct RankBadge: View {
  var rank: Int
  var body: some View {
    Text("\(rank)")
      .font(.system(size: 12, weight: .bold))
      .monospacedDigit()
      .foregroundStyle(rank == 1 ? Palette.amber : Palette.mutedForeground)
      .frame(width: 22, height: 22)
      .background(rank == 1 ? Palette.amberSoft : Palette.muted, in: Circle())
  }
}

/// A number with its unit in a smaller, muted size: 「1.08 秒」.
struct ValueWithUnit: View {
  var value: String
  var unit: String
  var size: CGFloat = 28
  var weight: Font.Weight = .medium

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 2) {
      Text(value).font(.system(size: size, weight: weight)).monospacedDigit().foregroundStyle(Palette.foreground)
      if !unit.isEmpty { Text(unit).font(.system(size: max(12, size * 0.5))).foregroundStyle(Palette.mutedForeground) }
    }
  }
}

/// The page's content column: centred with the web's max width and padding.
struct PageScroll<Content: View>: View {
  var maxWidth: CGFloat = 960
  @ViewBuilder var content: Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) { content }
        .frame(maxWidth: maxWidth, alignment: .leading)
        .padding(.horizontal, 32)
        .padding(.top, 32)
        .padding(.bottom, 48)
        .frame(maxWidth: .infinity)
    }
    .background(Palette.page)
  }
}
