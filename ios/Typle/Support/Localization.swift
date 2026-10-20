import Foundation
import TypleCore

/// The languages the iPad app has text for. 一般 switches between them in place, as the web app's settings do.
enum AppLanguage: String, CaseIterable, Identifiable {
  case ja, en
  var id: String { rawValue }

  /// Japanese for a Japanese iPad, English otherwise, until one is chosen.
  static var preferred: AppLanguage {
    Locale.preferredLanguages.first?.hasPrefix("ja") == false ? .en : .ja
  }

  var locale: Locale { Locale(identifier: rawValue) }
}

enum Localization {
  private(set) static var bundle = Bundle.main
  private(set) static var locale = Locale(identifier: "ja")

  static func use(_ language: AppLanguage) {
    bundle = Bundle.main.path(forResource: language.rawValue, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
    locale = language.locale
  }
}

/// The text for a key in Localizable.strings, in the chosen language. Screens never hold literal text, as in the web
/// app's messages.
func L(_ key: String, _ arguments: CVarArg...) -> String {
  let format = Localization.bundle.localizedString(forKey: key, value: nil, table: nil)
  return arguments.isEmpty ? format : String(format: format, locale: Localization.locale, arguments: arguments)
}

/// Fills `{name}` placeholders, the form error messages share with the web app.
func fill(_ text: String, _ values: [String: String]) -> String {
  values.reduce(text) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
}

/// The message for an error, in the reader's language.
func errorText(_ error: Error) -> String {
  if let error = error as? TypleError {
    let key = "errors.\(error.key)"
    let text = Localization.bundle.localizedString(forKey: key, value: nil, table: nil)
    return text == key ? L("errors.workspaceRequestFailed") : fill(text, error.values)
  }
  return L("errors.workspaceRequestFailed")
}

enum Format {
  /// The unit's name after a number: 「秒」 / 「s」.
  private static func unit(_ unit: TimeUnit) -> String {
    switch unit {
    case .hours: return L("format.hoursUnit")
    case .minutes: return L("format.minutesUnit")
    case .seconds: return L("format.secondsUnit")
    }
  }

  /// Number and unit pairs joined as text, with the space English puts between them.
  private static func joined(_ parts: [(String, String)]) -> String {
    parts.map { $0 + L("format.unitSpace") + $1 }.joined(separator: L("format.timeSeparator"))
  }

  /// A record's time: 「1.08秒」「1分15.50秒」.
  static func duration(_ seconds: Double) -> String { joined(durationParts(seconds)) }

  /// A record's time as number and unit pairs, for a large number with a small unit.
  static func durationParts(_ seconds: Double) -> [(String, String)] {
    recordTimeParts(seconds).map { ($0, unit($1)) }
  }

  /// A total practice time in whole units: 「18分32秒」.
  static func totalParts(_ seconds: Double) -> [(String, String)] {
    TypleCore.durationParts(seconds).map { ($0, unit($1)) }
  }

  static func total(_ seconds: Double) -> String { joined(totalParts(seconds)) }

  static func seconds(_ value: Double) -> String { String(format: "%.2f", value) }

  /// 「今日」「昨日」「10月18日」, with the year only for another year, like the web app's useFormat().day.
  static func day(_ date: Date, now: Date = Date()) -> String {
    switch dayKind(date, now: now) {
    case .today: return L("format.today")
    case .yesterday: return L("format.yesterday")
    case .thisYear: return date.formatted(.dateTime.month().day().locale(Localization.locale))
    case .otherYear: return date.formatted(.dateTime.year().month().day().locale(Localization.locale))
    }
  }

  /// 「10月20日（火）」.
  static func dateWithWeekday(_ date: Date) -> String {
    L("format.dateWithWeekday", date.formatted(.dateTime.month().day().locale(Localization.locale)),
      date.formatted(.dateTime.weekday(.abbreviated).locale(Localization.locale)))
  }

  static func date(_ value: String) -> String {
    guard let date = parseDate(value) else { return value }
    return day(date) + " " + time(value)
  }

  static func time(_ value: String) -> String {
    guard let date = parseDate(value) else { return value }
    return date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(Localization.locale))
  }

  static func device(_ device: PracticeDevice?) -> String {
    guard let device else { return L("format.noDevice") }
    let name = device.id == defaultDeviceId ? L("format.defaultDevice") : device.name
    return device.layout.isEmpty ? name : L("format.deviceWithLayout", name, device.layout)
  }

  static func number(_ value: Double, digits: Int = 1) -> String {
    value.formatted(.number.precision(.fractionLength(0...digits)).locale(Localization.locale))
  }

  static func accuracy(_ value: Double?) -> String { formatAccuracy(value) }
}
