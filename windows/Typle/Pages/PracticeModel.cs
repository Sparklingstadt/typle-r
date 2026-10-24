using Typle.Core;

namespace Typle.Pages;

public enum SaveState { Idle, Saving, Saved, Failed }

/// <summary>One practice run (src/lib/usePractice.ts): the session, the device it started on and saving its record.</summary>
public sealed class PracticeModel
{
    public string? ListId { get; private set; }

    public TypingSession Session { get; private set; } = new();

    /// <summary>The device chosen when the run started; changing the choice mid-run does not change the record.</summary>
    public PracticeDevice? PracticeDevice { get; private set; }

    /// <summary>Whether an input method is composing text in the field.</summary>
    public bool Composing { get; set; }

    public StoredRecord? Record { get; private set; }

    public SaveState SaveState { get; private set; }

    /// <summary>The visit to the practice page this run belongs to (AppModel.PracticeVisit).</summary>
    public int Visit { get; set; } = -1;

    public bool Finished => Session.FinishedAt is not null;

    public bool Started => Session.StartedAt is not null;

    public bool Running => Started && !Finished;

    public WordList? List(IReadOnlyList<WordList> lists) => lists.FirstOrDefault(list => list.Id == ListId) ?? lists.FirstOrDefault();

    /// <summary>Starts again, on another list when given.</summary>
    public void Restart(string? listId = null)
    {
        if (listId is not null) ListId = listId;
        Session = new TypingSession();
        PracticeDevice = null;
        Composing = false;
        Record = null;
        SaveState = SaveState.Idle;
    }

    /// <summary>Stops the clock while the field has lost focus mid-run (v0.81.0); the time away is left out of the record.</summary>
    public void Pause() => Session = Typing.Pause(Session, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

    public void Resume() => Session = Typing.Resume(Session, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

    /// <summary>Applies the field's committed text. Returns the record to save when the run has just finished.</summary>
    public StoredRecord? Enter(string value, WordList list, PracticeDevice? device)
    {
        if (Record is not null) return null;
        var next = Typing.TypeInput(Session, list.Words, value, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        if (Session.StartedAt is null && next.StartedAt is not null) PracticeDevice = device;
        ListId = list.Id;
        Session = next;
        if (next.FinishedAt is null) return null;
        try
        {
            Record = Records.Make(next, list.Words.Count, Ids.Random(), PracticeDevice);
        }
        catch (TypleException)
        {
            return null;
        }
        return Record;
    }

    /// <summary>Saves the finished run's record; the state follows only while that record is still the one shown.</summary>
    public async Task SaveAsync(AppModel app, Action changed)
    {
        if (Record is not { } record || ListId is not { } listId) return;
        SaveState = SaveState.Saving;
        changed();
        try
        {
            await app.AddRecordAsync(record, listId);
            if (ReferenceEquals(Record, record)) SaveState = SaveState.Saved;
        }
        catch (Exception)
        {
            if (ReferenceEquals(Record, record)) SaveState = SaveState.Failed;
        }
        changed();
    }
}
