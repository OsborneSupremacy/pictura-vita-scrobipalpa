using System.Text;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Utility;

namespace Pictura.Vita.Api.Narratives;

/// <summary>
/// Finds, reads and writes episode narratives — the long-form Markdown account of an episode.
///
/// The timeline holds only a file name; the text lives in the timeline's own directory,
/// exactly as images do:
///
/// <code>&lt;timelines root&gt;/&lt;timeline id&gt;/narratives/&lt;file name&gt;</code>
///
/// See docs/narrative-support.md for the layout and
/// the reasoning; the short version is that prose belongs in a text file, where a diff is
/// readable and any editor can open it, not in one escaped JSON string.
/// </summary>
public sealed class NarrativeStore
{
    /// <summary>
    /// Largest narrative accepted, in UTF-8 bytes. A megabyte is roughly 150,000 words —
    /// far past "pretty long" and well short of anything that would make reading the file
    /// on demand a problem. The limit exists so a runaway paste cannot fill the data
    /// directory, not because any real narrative approaches it.
    /// </summary>
    public const int MaxBytes = 1024 * 1024;

    private readonly string _root;

    private NarrativeStore(string root) => _root = root;

    /// <summary>
    /// The timelines root. Each timeline's prose lives in
    /// <c>&lt;root&gt;/&lt;id&gt;/narratives</c>, which need not exist yet — it is created on
    /// the first save.
    /// </summary>
    public string Root => _root;

    public bool RootExists => Directory.Exists(_root);

    /// <summary>
    /// Opens the store over the timelines root.
    ///
    /// As with images there is no override for where prose lives: an episode's narrative sits
    /// inside its own timeline's directory, which is what makes a timeline one portable folder
    /// rather than three separately configured paths that drift.
    ///
    /// A missing narrative directory is not a startup failure. Narratives are optional, and an
    /// episode without one is a perfectly ordinary episode.
    /// </summary>
    public static NarrativeStore Create(string timelinesRoot) =>
        new(Path.GetFullPath(timelinesRoot));

    /// <summary>
    /// The narrative file names present for a timeline.
    ///
    /// Fetched by the client alongside the timeline, like the image listing and for the same
    /// reason: the detail panel has to decide whether to offer "Read narrative" before it
    /// draws, and finding out from a 404 afterwards means a button that turns out to do
    /// nothing. It also lets the episode dialog offer files dropped into the folder by hand.
    /// </summary>
    public IReadOnlyList<string> List(Guid timelineId)
    {
        var directory = TimelineDirectory(timelineId);

        if (!Directory.Exists(directory)) return [];

        return Directory.EnumerateFiles(directory)
            .Select(Path.GetFileName)
            .Where(name => NarrativeFileName.IsValid(name))
            .Select(name => name!)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>
    /// The Markdown text of a narrative, or null when there is nothing to read.
    ///
    /// Null covers every way this can fail — an unsafe name, a name that escapes the root, a
    /// missing file, a file whose bytes cannot be fetched. They are one outcome on purpose:
    /// the caller answers 404 to all of them, so probing reveals nothing about what exists
    /// outside the sandbox.
    ///
    /// The unreadable case is worth its own log line rather than silence. This project's data
    /// directory lives in iCloud Drive with Optimise Mac Storage on, which leaves an evicted
    /// file in place and materialises it on read — so a read that fails outright usually
    /// means iCloud cannot fetch it back right now, which is a very different problem from a
    /// name that points at nothing.
    /// </summary>
    public string? Read(Guid timelineId, string? name, ILogger logger)
    {
        var path = NarrativeFileName.ResolveWithin(TimelineDirectory(timelineId), name);
        if (path is null || !File.Exists(path)) return null;

        try
        {
            return File.ReadAllText(path, Encoding.UTF8);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(
                exception,
                "{Path} exists but could not be read; if it lives in iCloud Drive it may have "
                + "been evicted and cannot be fetched back right now. The episode will offer "
                + "nothing to read.",
                path);
            return null;
        }
    }

    /// <summary>
    /// Writes <paramref name="text"/> and returns the name the episode should record.
    ///
    /// <paramref name="name"/> is the file to write when the episode already points at one,
    /// and empty when it does not — in which case a name is generated from
    /// <paramref name="preferredStem"/>, normally the episode's title.
    ///
    /// Accepting a name from the client is a real difference from image upload, where the
    /// name is always generated. It has to be: a narrative is edited over and over, and its
    /// name must not move underneath the episode that refers to it, so *something* has to
    /// say which file to write. What makes it safe is that the name is put through the same
    /// containment check the read path uses — an unsafe name is refused outright rather than
    /// quietly redirected, because on the write path an escape overwrites rather than merely
    /// discloses.
    /// </summary>
    public Result<string> Save(
        Guid timelineId,
        string? name,
        string? preferredStem,
        string text,
        ILogger logger)
    {
        var byteCount = Encoding.UTF8.GetByteCount(text);

        if (byteCount > MaxBytes)
            // Rounded up, or a narrative ten bytes over the limit is reported as being
            // exactly the size of the limit it just exceeded.
            return new ArgumentException(
                $"That narrative is {(byteCount + 1023) / 1024} KB; the limit is {MaxBytes / 1024} KB.");

        var directory = TimelineDirectory(timelineId);

        string chosen;

        if (!string.IsNullOrWhiteSpace(name))
        {
            if (!NarrativeFileName.IsValid(name))
                return new ArgumentException(
                    $"\"{name}\" is not a bare file name ending in .md.");

            chosen = name;
        }
        else
        {
            // Uniqueness is checked against the directory rather than the timeline, so a file
            // put there by hand is not overwritten by a new episode that happens to share its
            // title.
            var existing = List(timelineId).ToHashSet(StringComparer.OrdinalIgnoreCase);
            chosen = NarrativeFileName.Suggest(preferredStem, existing.Contains);
        }

        // Belt and braces: the containment check is the one thing standing between a file
        // name and the rest of the disk, so it runs again on the resolved path even for a
        // name this class generated itself.
        var destination = NarrativeFileName.ResolveWithin(directory, chosen);

        if (destination is null)
            return new InvalidOperationException($"Refusing to write \"{chosen}\" outside the narrative root.");

        try
        {
            Directory.CreateDirectory(directory);
            WriteAtomically(destination, text, directory);

            logger.LogInformation(
                "Stored narrative {Name} ({Bytes} bytes) for timeline {TimelineId}.",
                chosen,
                byteCount,
                timelineId);

            return chosen;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogError(exception, "Could not write {Destination}.", destination);
            return new IOException($"Could not write to the narrative directory at {directory}.");
        }
    }

    private string TimelineDirectory(Guid timelineId) =>
        Path.Combine(_root, timelineId.ToString(), TimelineFileStore.NarrativesDirectoryName);

    /// <summary>
    /// Writes under a temporary name and moves it into place, so a reader never sees a
    /// half-written file — and so an interrupted save cannot leave a truncated narrative
    /// where the whole one used to be. This is the only writer of prose the user typed; the
    /// JSON store has its own copy of everything else.
    ///
    /// No BOM: the file is meant to be opened by other editors, and a BOM on a Markdown file
    /// shows up as stray characters in the ones that do not expect it.
    /// </summary>
    private static void WriteAtomically(string destination, string text, string directory)
    {
        var temporary = Path.Combine(directory, $".{Guid.CreateVersion7()}.tmp");

        try
        {
            File.WriteAllText(temporary, text, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            File.Move(temporary, destination, overwrite: true);
        }
        catch
        {
            if (File.Exists(temporary)) File.Delete(temporary);
            throw;
        }
    }
}
