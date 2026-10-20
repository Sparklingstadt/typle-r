import Foundation

// The forms Typle stores (see server/internal/workspace/time.go): toISOString for its own records, and the slash
// form of the sample lists and lists from before ISO dates. Like Date.parse, a date without a time is UTC, and a
// time without a zone is local.
private let isoFractional: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter
}()

private let iso: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  return formatter
}()

private func formatter(_ format: String, _ zone: TimeZone?) -> DateFormatter {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.dateFormat = format
  formatter.isLenient = false
  if let zone { formatter.timeZone = zone }
  return formatter
}

private let zoned = [formatter("yyyy-MM-dd'T'HH:mmXXXXX", nil)]
private let utc = [formatter("yyyy-MM-dd", TimeZone(identifier: "UTC"))]
// They follow the time zone of the iPad as it changes.
private let local = [
  "yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm",
  "yyyy/M/d H:mm:ss", "yyyy/M/d H:mm", "yyyy/M/d",
].map { formatter($0, TimeZone.autoupdatingCurrent) }

/// Reads a stored date, or nil when Typle would reject it.
public func parseDate(_ value: String) -> Date? {
  let value = millisecondPrecision(value)
  if let date = isoFractional.date(from: value) ?? iso.date(from: value) { return date }
  for formatter in zoned + utc + local {
    if let date = formatter.date(from: value) { return date }
  }
  return nil
}

// ISO8601DateFormatter reads three fractional digits; Go and Python write up to nine (`03:01:23.866446Z`).
private func millisecondPrecision(_ value: String) -> String {
  guard let range = value.range(of: #"(?<=:\d\d)\.\d+"#, options: .regularExpression) else { return value }
  let digits = value[range].dropFirst()
  return value.replacingCharacters(in: range, with: "." + String((digits + "00").prefix(3)))
}

/// `Date.prototype.toISOString`: UTC with milliseconds, such as `2026-10-10T02:00:00.000Z`.
public func isoString(_ date: Date) -> String {
  isoFractional.string(from: date)
}

/// Milliseconds since 1970 for a stored date, or 0 when unreadable (records are validated when read).
func timeOf(_ value: String) -> Double {
  (parseDate(value)?.timeIntervalSince1970 ?? 0) * 1000
}
