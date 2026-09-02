using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Pictura.Vita.Data.Providers;

/// <summary>
/// The only thing in the application that reads or writes a timeline file.
///
/// A timeline is one directory named for its id, holding its data file, its images and its
/// narratives:
///
/// <code>
/// &lt;root&gt;/&lt;timeline id&gt;/data.v1.json
/// &lt;root&gt;/&lt;timeline id&gt;/images/
/// &lt;root&gt;/&lt;timeline id&gt;/narratives/
/// </code>
///
/// The directory name <em>is</em> the identity. Every path is therefore a pure function of the
/// id — nothing has to scan the disk to work out where a timeline lives — and a directory
/// copied under a new name cannot quietly serve as a second timeline, because the id inside
/// the file has to agree with the name of the directory holding it.
/// </summary>
public sealed class TimelineFileStore
{
    /// <summary>
    /// The data file's name, version and all.
    ///
    /// The version is in the name rather than a field inside so that a migration can write
    /// the new file beside the old one and a directory listing shows, at a glance, which
    /// shape a timeline is in.
    /// </summary>
    public const string DataFileName = "data.v1.json";

    public const string ImagesDirectoryName = "images";

    public const string NarrativesDirectoryName = "narratives";

    /// <summary>
    /// One serializer for the data file, matching what the previous store wrote so existing
    /// files load unchanged: camelCase names, enums as integers, dates as "1930-12-15".
    ///
    /// Indented because the file is meant to be opened by a person and read in a diff — the
    /// whole argument for keeping prose out of it (see docs/narrative-support.md) assumes the
    /// JSON itself stays legible.
    ///
    /// RespectNullableAnnotations is the reason the timeline no longer goes through
    /// Newtonsoft: a JSON null landing in a non-nullable `required string` used to load
    /// silently and only surface much later, if at all.
    /// </summary>
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        RespectNullableAnnotations = true
    };

    /// <summary>
    /// One lock per timeline, so a read-modify-write of one file cannot interleave with
    /// another of the same file, and two different timelines never wait on each other.
    /// </summary>
    private readonly ConcurrentDictionary<Guid, SemaphoreSlim> _locks = new();

    private readonly ILogger _logger;

    private readonly string _root;

    public TimelineFileStore(string root, ILogger? logger = null)
    {
        _root = Path.GetFullPath(root);
        _logger = logger ?? NullLogger.Instance;
    }

    /// <summary>The directory holding every timeline.</summary>
    public string Root => _root;

    public string DirectoryFor(Guid timelineId) => Path.Combine(_root, timelineId.ToString());

    public string DataFileFor(Guid timelineId) => Path.Combine(DirectoryFor(timelineId), DataFileName);

    public bool Exists(Guid timelineId) => File.Exists(DataFileFor(timelineId));

    /// <summary>
    /// The ids of every timeline present under the root.
    ///
    /// A subdirectory counts only if its name parses as a Guid and it actually holds a data
    /// file. Anything else is skipped rather than thrown on: a stray <c>.DS_Store</c>, a
    /// half-finished copy, or a directory left behind by some other tool must not be able to
    /// take out the table of contents.
    /// </summary>
    public IReadOnlyList<Guid> Ids()
    {
        if (!Directory.Exists(_root)) return [];

        var ids = new List<Guid>();

        foreach (var directory in Directory.EnumerateDirectories(_root))
        {
            var name = Path.GetFileName(directory);

            if (!Guid.TryParse(name, out var id))
            {
                _logger.LogDebug("Ignoring {Directory}: its name is not a timeline id.", directory);
                continue;
            }

            if (!File.Exists(Path.Combine(directory, DataFileName)))
            {
                _logger.LogWarning(
                    "Ignoring {Directory}: it holds no {DataFileName}.", directory, DataFileName);
                continue;
            }

            ids.Add(id);
        }

        return ids;
    }

    /// <summary>
    /// Reads one timeline.
    ///
    /// A missing directory and a missing file are the same answer — there is no such timeline
    /// — so both come back as <see cref="KeyNotFoundException"/> and the API answers 404. A
    /// file that is present but unreadable, unparseable, or whose id disagrees with the
    /// directory it sits in is a different thing entirely: the data is there and is wrong, and
    /// saying "not found" would invite a caller to overwrite it.
    ///
    /// Cancellation is not one of those outcomes and does not come back as a
    /// <see cref="Result"/>: a caller who has gone away has not been told anything about the
    /// timeline, so <see cref="OperationCanceledException"/> propagates rather than being
    /// flattened into a failure that reads like a problem with the file.
    /// </summary>
    public async Task<Result<Timeline>> ReadAsync(
        Guid timelineId,
        CancellationToken cancellationToken = default)
    {
        var path = DataFileFor(timelineId);

        if (!File.Exists(path))
            return new KeyNotFoundException($"Timeline with id {timelineId} not found");

        Timeline? timeline;

        try
        {
            await using var input = File.OpenRead(path);
            timeline = await JsonSerializer.DeserializeAsync<Timeline>(
                input, SerializerOptions, cancellationToken);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // On this project's usual setup this is almost always iCloud: the data directory
            // lives in iCloud Drive with Optimise Mac Storage on, which leaves an evicted file
            // in place and materialises it on read. A read that still fails is worth its own
            // message, because "cannot be fetched right now" is not "corrupt".
            _logger.LogError(exception, "Could not read {Path}.", path);
            return new IOException($"Could not read the timeline file at {path}.", exception);
        }
        catch (JsonException exception)
        {
            _logger.LogError(exception, "{Path} is not a valid timeline file.", path);
            return new InvalidDataException($"{path} is not a valid timeline file: {exception.Message}");
        }

        if (timeline is null)
            return new InvalidDataException($"{path} holds no timeline.");

        if (timeline.TimelineId != timelineId)
            return new InvalidDataException(
                $"{path} holds timeline {timeline.TimelineId}, but sits in the directory for "
                + $"{timelineId}. The directory name is the timeline's identity; rename the "
                + "directory or correct the file, but do not leave the two disagreeing.");

        return timeline;
    }

    /// <summary>
    /// Writes a timeline, creating its directory if this is the first time.
    ///
    /// The write is atomic: the JSON goes to a temporary file in the same directory and is
    /// then moved over the destination, so an interrupted write leaves the previous file
    /// intact rather than a truncated one. Serialising to memory first is deliberate — a
    /// serializer that throws half way through must not have already replaced anything.
    ///
    /// Takes no <see cref="CancellationToken"/>, and that is the decision rather than an
    /// omission. The token available here would be the request's, which trips when the browser
    /// goes away — and a save that is already under way should finish rather than be abandoned
    /// because someone closed the tab. Reads cancel freely; writes run to completion.
    /// </summary>
    public async Task<Result> WriteAsync(Timeline timeline)
    {
        var directory = DirectoryFor(timeline.TimelineId);
        var destination = Path.Combine(directory, DataFileName);
        var temporary = Path.Combine(directory, $".{Guid.CreateVersion7()}.tmp");

        try
        {
            var content = JsonSerializer.SerializeToUtf8Bytes(timeline, SerializerOptions);

            Directory.CreateDirectory(directory);

            await File.WriteAllBytesAsync(temporary, content);
            File.Move(temporary, destination, overwrite: true);

            return Results.Success;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            _logger.LogError(exception, "Could not write {Destination}.", destination);

            if (File.Exists(temporary))
                File.Delete(temporary);

            return new IOException($"Could not write the timeline file at {destination}.", exception);
        }
    }

    /// <summary>
    /// Lays out a new timeline's directory and writes its first data file.
    ///
    /// The two side directories are created empty rather than waiting for the first upload or
    /// the first narrative. They cost nothing, and a folder that shows its own shape the
    /// moment it exists is the difference between "one portable folder" being a claim in a
    /// README and something visible to whoever you hand it to.
    /// </summary>
    public async Task<Result> CreateAsync(Timeline timeline)
    {
        var directory = DirectoryFor(timeline.TimelineId);

        if (Exists(timeline.TimelineId))
            return new InvalidOperationException(
                $"A timeline already exists at {directory}.");

        try
        {
            Directory.CreateDirectory(Path.Combine(directory, ImagesDirectoryName));
            Directory.CreateDirectory(Path.Combine(directory, NarrativesDirectoryName));
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            _logger.LogError(exception, "Could not create {Directory}.", directory);
            return new IOException($"Could not create the timeline directory at {directory}.", exception);
        }

        return await WriteAsync(timeline);
    }

    /// <summary>
    /// Reads a timeline, hands it to <paramref name="transform"/>, and writes back whatever
    /// comes out — all while holding the timeline's lock.
    ///
    /// This is the only way a timeline is changed. <see cref="Timeline"/> and everything under
    /// it are records, so <paramref name="transform"/> produces a new value rather than
    /// editing anything shared; nothing is visible to another request until the file has
    /// actually been replaced. The previous store worked the other way round — it mutated the
    /// cached object first and wrote afterwards, so a failed write still left the change in
    /// memory.
    ///
    /// Cancellable only up to the point where it starts changing something. Waiting for the
    /// lock and reading the file can both be abandoned safely, because neither has done
    /// anything yet; once the transform has run, the write goes ahead whatever the caller is
    /// doing. Half-applying an edit because a request was aborted would be the one outcome
    /// worse than either finishing it or never starting.
    /// </summary>
    public async Task<Result> MutateAsync(
        Guid timelineId,
        Func<Timeline, Result<Timeline>> transform,
        CancellationToken cancellationToken = default)
    {
        var padlock = _locks.GetOrAdd(timelineId, _ => new SemaphoreSlim(1, 1));

        // Outside the try on purpose: a wait that is cancelled never took the lock, and must
        // not reach the Release in the finally.
        await padlock.WaitAsync(cancellationToken);

        try
        {
            var current = await ReadAsync(timelineId, cancellationToken);

            if (current.IsFaulted) return current.Exception;

            var updated = transform(current.Value);

            return updated.IsFaulted
                ? updated.Exception
                : await WriteAsync(updated.Value);
        }
        finally
        {
            padlock.Release();
        }
    }
}
