import Foundation

/// One run through a list (src/core/typing.ts). Times are milliseconds since 1970.
public struct TypingSession: Equatable, Sendable {
  public var index = 0
  public var input = ""
  public var startedAt: Double?
  public var finishedAt: Double?
  public var attempts = 0
  public var mistakes = 0

  public init() {}
}

/// Applies the input field's new value. Only characters added since the last value count as attempts, and an added
/// character is a mistake when it differs from the character at its position.
public func typeInput(_ session: TypingSession, words: [Word], value: String, now: Double) -> TypingSession {
  guard session.finishedAt == nil, session.index < words.count else { return session }
  let target = words[session.index].input.codePoints
  let previous = session.input.codePoints
  let next = value.codePoints
  var common = 0
  while common < previous.count && common < next.count && previous[common] == next[common] { common += 1 }
  let inserted = next[common...]
  var updated = session
  updated.input = value
  updated.startedAt = session.startedAt ?? (value.isEmpty ? nil : now)
  updated.attempts += inserted.count
  updated.mistakes += inserted.enumerated().filter { offset, char in
    let index = common + offset
    return index >= target.count || char != target[index]
  }.count
  // Compared by code point, as JavaScript does, so composed and decomposed forms stay different.
  guard next == target else { return updated }
  if session.index == words.count - 1 {
    updated.finishedAt = now
    return updated
  }
  updated.index += 1
  updated.input = ""
  return updated
}

public struct SessionResult: Equatable, Sendable {
  public var time: Double
  public var mistakes: Int
  public var accuracy: Double
}

public func sessionResult(_ session: TypingSession) -> SessionResult {
  let accuracy = session.attempts > 0
    ? (Double(session.attempts - session.mistakes) / Double(session.attempts) * 10000).rounded() / 100 : 100
  return SessionResult(time: max(0, ((session.finishedAt ?? 0) - (session.startedAt ?? 0)) / 1000),
                       mistakes: session.mistakes, accuracy: accuracy)
}

public enum CharacterState: Sendable {
  case done, current, error, currentError, pending
}

public struct InputComparison: Equatable, Sendable {
  public var characters: [String]
  public var states: [CharacterState]
  public var extra: [String]
  /// The first wrong position, or nil when everything typed so far is right.
  public var errorIndex: Int?
}

/// Compares only committed input with the characters to type. Everything from the first mismatch on is an error,
/// so a later character that happens to match is not shown as correct.
public func compareInput(target: String, typed: String) -> InputComparison {
  let characters = target.codePoints
  let actual = typed.codePoints
  var errorIndex = actual.indices.first { $0 < characters.count && actual[$0] != characters[$0] }
  if errorIndex == nil && actual.count > characters.count { errorIndex = characters.count }
  let states = characters.indices.map { index -> CharacterState in
    if index < actual.count { return errorIndex == nil || index < errorIndex! ? .done : .error }
    if index == actual.count { return errorIndex == nil ? .current : .currentError }
    return .pending
  }
  return InputComparison(characters: characters.map { String($0) }, states: states,
                         extra: actual.dropFirst(characters.count).map { String($0) }, errorIndex: errorIndex)
}

/// Correctly typed characters per minute; nil until a second has passed.
public func typingSpeed(_ session: TypingSession, now: Double) -> Int? {
  guard let startedAt = session.startedAt else { return nil }
  let elapsed = (session.finishedAt ?? now) - startedAt
  return elapsed < 1000 ? nil : Int((Double(session.attempts - session.mistakes) / (elapsed / 60000)).rounded())
}
