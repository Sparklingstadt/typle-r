namespace Typle.Core;

/// <summary>One run through a list (src/core/typing.ts). Times are milliseconds since 1970.</summary>
public sealed record TypingSession(
    int Index = 0,
    string Input = "",
    double? StartedAt = null,
    double? FinishedAt = null,
    int Attempts = 0,
    int Mistakes = 0,
    // When the input lost focus mid-practice; the clock stands still until it is resumed.
    double? PausedAt = null);

public sealed record SessionResult(double Time, int Mistakes, double Accuracy);

public enum CharacterState { Done, Current, Error, CurrentError, Pending }

public sealed record InputComparison(
    IReadOnlyList<string> Characters,
    IReadOnlyList<CharacterState> States,
    IReadOnlyList<string> Extra,
    // The first wrong position, or null when everything typed so far is right.
    int? ErrorIndex);

public static class Typing
{
    /// <summary>Stops the clock of a running session. Before the first character or after the last there is nothing to stop.</summary>
    public static TypingSession Pause(TypingSession session, double now) =>
        session.StartedAt is null || session.FinishedAt is not null || session.PausedAt is not null ? session : session with { PausedAt = now };

    /// <summary>Moves StartedAt on by the length of the pause, so elapsed time, speed and the recorded time all leave it out.</summary>
    public static TypingSession Resume(TypingSession session, double now) =>
        session.PausedAt is not { } pausedAt || session.StartedAt is not { } startedAt
            ? session
            : session with { StartedAt = startedAt + Math.Max(0, now - pausedAt), PausedAt = null };

    /// <summary>Milliseconds of typing so far: up to the finish, or to the pause while paused.</summary>
    public static double Elapsed(TypingSession session, double now) =>
        session.StartedAt is not { } startedAt ? 0 : Math.Max(0, (session.FinishedAt ?? session.PausedAt ?? now) - startedAt);

    /// <summary>
    /// Applies the input field's new value. Only characters added since the last value count as attempts, and an added
    /// character is a mistake when it differs from the character at its position.
    /// </summary>
    public static TypingSession TypeInput(TypingSession current, IReadOnlyList<Word> words, string value, double now)
    {
        if (current.FinishedAt is not null || current.Index >= words.Count) return current;
        // Typing always runs the clock, even if the field was not focused through the usual event.
        var session = Resume(current, now);
        var target = Text.CodePoints(words[session.Index].Input);
        var previous = Text.CodePoints(session.Input);
        var next = Text.CodePoints(value);
        var common = 0;
        while (common < previous.Count && common < next.Count && previous[common] == next[common]) common++;
        var inserted = next.Skip(common).ToList();
        var mistakes = 0;
        for (var offset = 0; offset < inserted.Count; offset++)
        {
            var index = common + offset;
            if (index >= target.Count || inserted[offset] != target[index]) mistakes++;
        }
        var updated = session with
        {
            Input = value,
            StartedAt = session.StartedAt ?? (value.Length == 0 ? null : now),
            Attempts = session.Attempts + inserted.Count,
            Mistakes = session.Mistakes + mistakes,
        };
        // Compared by code point, as JavaScript does, so composed and decomposed forms stay different.
        if (!next.SequenceEqual(target)) return updated;
        if (session.Index == words.Count - 1) return updated with { FinishedAt = now };
        return updated with { Index = session.Index + 1, Input = "" };
    }

    public static SessionResult Result(TypingSession session)
    {
        var accuracy = session.Attempts > 0
            ? Text.JsRound((double)(session.Attempts - session.Mistakes) / session.Attempts * 10000) / 100
            : 100.0;
        return new SessionResult(
            Math.Max(0, ((session.FinishedAt ?? 0) - (session.StartedAt ?? 0)) / 1000), session.Mistakes, accuracy);
    }

    /// <summary>
    /// Compares only committed input with the characters to type. Everything from the first mismatch on is an error,
    /// so a later character that happens to match is not shown as correct.
    /// </summary>
    public static InputComparison CompareInput(string target, string typed)
    {
        var characters = Text.CodePoints(target);
        var actual = Text.CodePoints(typed);
        int? errorIndex = null;
        for (var i = 0; i < actual.Count; i++)
        {
            if (i < characters.Count && actual[i] != characters[i])
            {
                errorIndex = i;
                break;
            }
        }
        if (errorIndex is null && actual.Count > characters.Count) errorIndex = characters.Count;
        var states = new List<CharacterState>(characters.Count);
        for (var index = 0; index < characters.Count; index++)
        {
            if (index < actual.Count)
                states.Add(errorIndex is null || index < errorIndex ? CharacterState.Done : CharacterState.Error);
            else if (index == actual.Count)
                states.Add(errorIndex is null ? CharacterState.Current : CharacterState.CurrentError);
            else
                states.Add(CharacterState.Pending);
        }
        return new InputComparison(
            characters.Select(Text.FromCodePoint).ToList(), states, actual.Skip(characters.Count).Select(Text.FromCodePoint).ToList(),
            errorIndex);
    }

    /// <summary>Correctly typed characters per minute; null until a second has passed.</summary>
    public static int? Speed(TypingSession session, double now)
    {
        if (session.StartedAt is null) return null;
        var elapsed = Elapsed(session, now);
        return elapsed < 1000 ? null : (int)Text.JsRound((session.Attempts - session.Mistakes) / (elapsed / 60000));
    }
}
