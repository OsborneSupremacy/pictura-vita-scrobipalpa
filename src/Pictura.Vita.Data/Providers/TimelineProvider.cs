using System.Collections.Concurrent;

namespace Pictura.Vita.Data.Providers;

/// <summary>
/// Reads and writes timelines, one directory each.
///
/// Every operation names the timeline it works on. Nothing searches for the owner of an
/// episode or a category any more: with one file per timeline that would mean opening and
/// parsing every file on disk to delete one row.
///
/// Every mutation goes through <see cref="TimelineFileStore.MutateAsync"/>, which holds that
/// timeline's lock across the read, the transform and the write. The transforms below are
/// pure — they return a new <see cref="Timeline"/> record rather than editing the one they
/// were handed — so a failed write leaves nothing changed anywhere.
/// </summary>
public class TimelineProvider
{
    private readonly TimelineFileStore _store;

    /// <summary>
    /// Summaries already built, keyed by timeline id and validated against the data file's
    /// last-write time and length.
    ///
    /// The table of contents parses every timeline to draw itself, which is cheap but not
    /// free, and it is drawn on every visit. This keeps the parse to files that have actually
    /// changed. It is deliberately not a file on disk: an index written to the timelines
    /// directory would be a second source of truth, and dropping a timeline folder in by hand
    /// — a backup restored, a timeline someone handed over — is a workflow the application
    /// promises. A memory cache keyed on the file's own stat data cannot go stale that way.
    /// </summary>
    private readonly ConcurrentDictionary<Guid, CachedSummary> _summaries = new();

    public TimelineProvider(TimelineFileStore store) =>
        _store = store ?? throw new ArgumentNullException(nameof(store));

    /// <summary>Where the timelines live. Exposed so the API can log it at startup.</summary>
    public TimelineFileStore Store => _store;

    /// <summary>
    /// A summary of every timeline present under the root, title order.
    ///
    /// A timeline whose file cannot be read or parsed is left out rather than failing the
    /// whole listing: one corrupt directory should cost you that timeline, not the ability to
    /// open any of the others.
    /// </summary>
    /// <remarks>
    /// Returns a list rather than a lazy sequence, and says so in the type. It is materialised
    /// either way — the title ordering has to see every summary before it can yield the first,
    /// so there is nothing here to stream and no benefit in pretending otherwise.
    /// </remarks>
    public async Task<IReadOnlyList<TimelineSummary>> GetAllSummariesAsync(
        CancellationToken cancellationToken = default)
    {
        var ids = _store.Ids();
        var summaries = new List<TimelineSummary>(ids.Count);

        foreach (var id in ids)
        {
            // Checked here rather than relying on the read below, because a listing served
            // entirely from cache never awaits anything and would otherwise run to the end
            // long after whoever asked for it had gone.
            cancellationToken.ThrowIfCancellationRequested();

            var file = new FileInfo(_store.DataFileFor(id));

            if (_summaries.TryGetValue(id, out var cached) && cached.Matches(file))
            {
                summaries.Add(cached.Summary);
                continue;
            }

            var timeline = await _store.ReadAsync(id, cancellationToken);

            if (timeline.IsFaulted) continue;

            var summary = Summarise(timeline.Value);
            _summaries[id] = new CachedSummary(file.LastWriteTimeUtc, file.Length, summary);
            summaries.Add(summary);
        }

        // Timelines that have gone from disk should not go on occupying the cache; a long-
        // running API would otherwise hold every timeline ever deleted underneath it.
        //
        // Skipped when the listing above was cancelled, which is fine: this is opportunistic
        // cleanup that runs on every listing that finishes, and listings normally finish.
        foreach (var stale in _summaries.Keys.Except(ids))
            _summaries.TryRemove(stale, out _);

        return summaries.OrderBy(s => s.Title, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    public Task<Result<Timeline>> GetAsync(
        Guid timelineId,
        CancellationToken cancellationToken = default) =>
        _store.ReadAsync(timelineId, cancellationToken);

    /// <summary>
    /// Writes the timeline, replacing whatever was in its directory.
    ///
    /// Re-running an import should refresh a timeline, not stack up another copy of it — and
    /// since the directory is named for the id, "the same timeline" and "the same directory"
    /// are now the same statement.
    /// </summary>
    /// <returns>True when an existing timeline was replaced.</returns>
    public async Task<bool> UpsertAsync(Timeline timeline)
    {
        var existed = _store.Exists(timeline.TimelineId);

        var written = await _store.WriteAsync(timeline);

        if (written.IsFaulted) throw written.Exception;

        return existed;
    }

    /// <summary>
    /// Creates an empty timeline and returns it.
    ///
    /// The id is generated here rather than accepted from the caller, because the id names the
    /// directory: taking one from a request would be taking a path from a request.
    /// </summary>
    public async Task<Result<Timeline>> CreateAsync(CreateTimelineRequest request)
    {
        var timeline = new Timeline
        {
            TimelineId = Guid.CreateVersion7(),
            TimelineInfo = request.TimelineInfo,
            Episodes = [],
            Categories = []
        };

        var created = await _store.CreateAsync(timeline);

        return created.IsFaulted ? created.Exception : timeline;
    }

    public Task<Result> UpdateTimelineInfoAsync(
        UpdateTimelineInfoRequest request,
        CancellationToken cancellationToken = default) =>
        _store.MutateAsync(
            request.TimelineId,
            timeline => timeline with { TimelineInfo = request.TimelineInfo },
            cancellationToken);

    public async Task<Result<IEnumerable<Category>>> GetCategoriesAsync(
        Guid timelineId,
        CancellationToken cancellationToken = default)
    {
        var timeline = await _store.ReadAsync(timelineId, cancellationToken);

        return timeline.IsFaulted
            ? timeline.Exception
            : timeline.Value.Categories.ToList();
    }

    public async Task<Result<Category>> GetCategoryAsync(
        Guid timelineId,
        Guid categoryId,
        CancellationToken cancellationToken = default)
    {
        var timeline = await _store.ReadAsync(timelineId, cancellationToken);

        if (timeline.IsFaulted) return timeline.Exception;

        var category = timeline.Value.Categories.SingleOrDefault(c => c.CategoryId == categoryId);

        return category is null
            ? new KeyNotFoundException($"Category with id {categoryId} not found")
            : category;
    }

    public async Task<Result<Category>> InsertCategoryAsync(
        InsertCategoryRequest request,
        CancellationToken cancellationToken = default)
    {
        // Built outside the transform because it depends on nothing already in the file, which
        // keeps the transform pure and means the caller can hand the new category straight
        // back without re-reading anything.
        var newCategory = new Category
        {
            CategoryId = Guid.CreateVersion7(),
            Confidentiality = request.Confidentiality,
            Title = request.Title,
            Subtitle = request.Subtitle,
            Description = request.Description,
            SortOrder = request.SortOrder,
            Icon = request.Icon,
            Color = request.Color
        };

        var inserted = await _store.MutateAsync(
            request.TimelineId,
            timeline => timeline with { Categories = [.. timeline.Categories, newCategory] },
            cancellationToken);

        return inserted.IsFaulted ? inserted.Exception : newCategory;
    }

    public Task<Result> UpdateCategoryAsync(
        UpdateCategoryRequest request,
        CancellationToken cancellationToken = default) =>
        _store.MutateAsync(request.TimelineId, timeline =>
        {
            var category = timeline.Categories
                .SingleOrDefault(c => c.CategoryId == request.Category.CategoryId);

            if (category is null)
                return new KeyNotFoundException(
                    $"Category with id {request.Category.CategoryId} not found");

            var updated = category with
            {
                Confidentiality = request.Category.Confidentiality,
                Title = request.Category.Title,
                Subtitle = request.Category.Subtitle,
                Description = request.Category.Description,
                SortOrder = request.Category.SortOrder,
                Icon = request.Category.Icon,
                Color = request.Category.Color
            };

            // Replaced in place rather than removed and appended. The order in the file has no
            // meaning — the timeline draws bands by SortOrder — but shuffling a row to the end
            // on every edit makes the diff of a backup useless.
            return timeline with
            {
                Categories = [.. timeline.Categories.Select(c => c.CategoryId == updated.CategoryId ? updated : c)]
            };
        }, cancellationToken);

    /// <summary>
    /// Removes a category from its timeline.
    ///
    /// Episodes keep the category id they were tagged with. They are left in the file
    /// untouched and simply stop being drawn, since the layout only draws episodes whose
    /// category it can resolve. Deleting a category is therefore not a way to delete
    /// episodes, and nothing is lost that could not be recovered by recreating the
    /// category with the same id.
    /// </summary>
    public Task<Result> DeleteCategoryAsync(
        Guid timelineId,
        Guid categoryId,
        CancellationToken cancellationToken = default) =>
        _store.MutateAsync(timelineId, timeline =>
        {
            var category = timeline.Categories.SingleOrDefault(c => c.CategoryId == categoryId);

            if (category is null)
                return new KeyNotFoundException($"Category with id {categoryId} not found");

            return timeline with
            {
                Categories = [.. timeline.Categories.Where(c => c.CategoryId != categoryId)]
            };
        }, cancellationToken);

    public async Task<Result<Episode>> GetEpisodeAsync(
        Guid timelineId,
        Guid episodeId,
        CancellationToken cancellationToken = default)
    {
        var timeline = await _store.ReadAsync(timelineId, cancellationToken);

        if (timeline.IsFaulted) return timeline.Exception;

        var episode = timeline.Value.Episodes.SingleOrDefault(e => e.EpisodeId == episodeId);

        return episode is null
            ? new KeyNotFoundException($"Episode with id {episodeId} not found")
            : episode;
    }

    public async Task<Result<Episode>> InsertEpisodeAsync(
        InsertEpisodeRequest request,
        CancellationToken cancellationToken = default)
    {
        var newEpisode = new Episode
        {
            EpisodeId = Guid.CreateVersion7(),
            Confidentiality = request.Confidentiality,
            Title = request.Title,
            Subtitle = request.Subtitle,
            Description = request.Description,
            Url = request.Url,
            UrlDescription = request.UrlDescription,
            ImageName = request.ImageName,
            NarrativeName = request.NarrativeName,
            EpisodeType = !request.Indefinite && request.Start.Equals(request.End)
                ? EpisodeType.Incident
                : EpisodeType.Era,
            StartPrecision = request.StartPrecision,
            Start = request.Start,
            EndPrecision = request.EndPrecision,
            End = request.End,
            Indefinite = request.Indefinite,
            CategoryIds = request.CategoryIds
        };

        var inserted = await _store.MutateAsync(
            request.TimelineId,
            timeline => timeline with { Episodes = [.. timeline.Episodes, newEpisode] },
            cancellationToken);

        return inserted.IsFaulted ? inserted.Exception : newEpisode;
    }

    public Task<Result> UpdateEpisodeAsync(
        UpdateEpisodeRequest request,
        CancellationToken cancellationToken = default) =>
        _store.MutateAsync(request.TimelineId, timeline =>
        {
            var episode = timeline.Episodes
                .SingleOrDefault(e => e.EpisodeId == request.Episode.EpisodeId);

            if (episode is null)
                return new KeyNotFoundException(
                    $"Episode with id {request.Episode.EpisodeId} not found");

            var updated = episode with
            {
                Confidentiality = request.Episode.Confidentiality,
                Title = request.Episode.Title,
                Subtitle = request.Episode.Subtitle,
                Description = request.Episode.Description,
                Url = request.Episode.Url,
                UrlDescription = request.Episode.UrlDescription,
                ImageName = request.Episode.ImageName,
                NarrativeName = request.Episode.NarrativeName,
                // Derived from the dates, exactly as on insert. Trusting the client here let an
                // episode edited down to a single day stay typed as an Era, so it drew as a bar
                // instead of the callout an identical new episode would have got.
                EpisodeType = !request.Episode.Indefinite
                              && request.Episode.Start.Equals(request.Episode.End)
                    ? EpisodeType.Incident
                    : EpisodeType.Era,
                StartPrecision = request.Episode.StartPrecision,
                Start = request.Episode.Start,
                EndPrecision = request.Episode.EndPrecision,
                End = request.Episode.End,
                Indefinite = request.Episode.Indefinite,
                CategoryIds = request.Episode.CategoryIds
            };

            return timeline with
            {
                Episodes = [.. timeline.Episodes.Select(e => e.EpisodeId == updated.EpisodeId ? updated : e)]
            };
        }, cancellationToken);

    /// <summary>
    /// Permanently removes an episode from its timeline.
    ///
    /// Unlike removing a category, which only stops episodes being drawn, this discards the
    /// record. Nothing else refers to an episode, so there is nothing left dangling — and
    /// nothing to recover it from either, short of a backup.
    /// </summary>
    public Task<Result> DeleteEpisodeAsync(
        Guid timelineId,
        Guid episodeId,
        CancellationToken cancellationToken = default) =>
        _store.MutateAsync(timelineId, timeline =>
        {
            var episode = timeline.Episodes.SingleOrDefault(e => e.EpisodeId == episodeId);

            if (episode is null)
                return new KeyNotFoundException($"Episode with id {episodeId} not found");

            return timeline with
            {
                Episodes = [.. timeline.Episodes.Where(e => e.EpisodeId != episodeId)]
            };
        }, cancellationToken);

    private static TimelineSummary Summarise(Timeline timeline) => new()
    {
        TimelineId = timeline.TimelineId,
        Title = timeline.TimelineInfo.Title,
        Subtitle = timeline.TimelineInfo.Subtitle,
        Start = timeline.TimelineInfo.Start,
        End = timeline.TimelineInfo.End,
        Ongoing = timeline.TimelineInfo.Ongoing,
        EpisodeCount = timeline.Episodes.Count,
        CategoryCount = timeline.Categories.Count
    };

    private readonly record struct CachedSummary(
        DateTime LastWriteTimeUtc,
        long Length,
        TimelineSummary Summary)
    {
        /// <summary>
        /// Whether this summary still describes the file on disk.
        ///
        /// Length as well as the timestamp, because a file system whose timestamps have
        /// coarse resolution can record two writes in the same tick, and an edit that leaves
        /// the length alone is far likelier than one that matches both.
        /// </summary>
        public bool Matches(FileInfo file) =>
            file.Exists && file.LastWriteTimeUtc == LastWriteTimeUtc && file.Length == Length;
    }
}
