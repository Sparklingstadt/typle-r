import Foundation
import TypleCore

/// The text for a key in Localizable.strings, in the iPad's language (Japanese or English). Screens never hold
/// literal text, as in the web app's messages.
func L(_ key: String, _ arguments: CVarArg...) -> String {
  let format = NSLocalizedString(key, comment: "")
  return arguments.isEmpty ? format : String(format: format, locale: Locale.current, arguments: arguments)
}

/// Fills `{name}` placeholders, the form error messages share with the web app.
func fill(_ text: String, _ values: [String: String]) -> String {
  values.reduce(text) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
}

/// The message for an error, in the reader's language.
func errorText(_ error: Error) -> String {
  if let error = error as? TypleError {
    let key = "errors.\(error.key)"
    let text = NSLocalizedString(key, comment: "")
    return text == key ? L("errors.workspaceRequestFailed") : fill(text, error.values)
  }
  return L("errors.workspaceRequestFailed")
}

enum Format {
  static func duration(_ seconds: Double) -> String {
    recordTimeParts(seconds).map { value, unit in
      L(unit == .minutes ? "format.minutes" : "format.seconds", value)
    }.joined(separator: L("format.timeSeparator"))
  }

  static func date(_ value: String) -> String {
    guard let date = parseDate(value) else { return value }
    return date.formatted(date: .abbreviated, time: .shortened)
  }

  static func day(_ date: Date) -> String {
    let calendar = Calendar.current
    if calendar.isDateInToday(date) { return L("format.today") }
    if calendar.isDateInYesterday(date) { return L("format.yesterday") }
    return date.formatted(.dateTime.year().month().day().weekday(.abbreviated))
  }

  static func time(_ value: String) -> String {
    guard let date = parseDate(value) else { return value }
    return date.formatted(date: .omitted, time: .shortened)
  }

  static func device(_ device: PracticeDevice?) -> String {
    guard let device else { return L("format.noDevice") }
    let name = device.id == defaultDeviceId ? L("format.defaultDevice") : device.name
    return device.layout.isEmpty ? name : L("format.deviceWithLayout", name, device.layout)
  }

  static func number(_ value: Double, digits: Int = 1) -> String {
    value.formatted(.number.precision(.fractionLength(0...digits)))
  }
}
