using JsonFlatFileDataStore;

namespace Pictura.Vita.Data.Providers;

/// <summary>
/// Reads and writes timelines.
///
/// Every mutation writes the whole document with ReplaceOneAsync. The store's
/// UpdateOneAsync patches property by property, which fails both ways here: handed a
/// Result&lt;Timeline&gt; it matches no properties and silently writes nothing, and handed a
/// real Timeline it cannot construct the IList&lt;Guid&gt; behind Episode.CategoryIds. Changes
/// appeared to work either way because the in-memory collection had already been mutated;
/// only the file was left behind.
/// </summary>
public class TimelineProvider
{
    private readonly IDocumentCollection<Timeline> _collection;

    // ReSharper disable once PrivateFieldCanBeConvertedToLocalVariable
    private readonly IDataStore _dataStore;

    public TimelineProvider(IDataStore dataStore)
    {
        _dataStore = dataStore ?? throw new ArgumentNullException(nameof(dataStore));
        _collection = _dataStore.GetCollection<Timeline>();
    }

    public Task<IEnumerable<Timeline>> GetAllAsync()
    {
        var timelines = _collection.AsQueryable();
        return Task.FromResult(timelines);
    }

    public Task<IEnumerable<TimelineSummary>> GetAllSummariesAsync() =>
        Task.FromResult(_collection.AsQueryable()
            .Select(t => new TimelineSummary
            {
                TimelineId = t.TimelineId,
                Title = t.TimelineInfo.Title
            }));

    public async Task<Result<Timeline>> GetAsync(Guid timelineId)
    {
        var timeline = (await GetAllAsync())
            .SingleOrDefault(x => x.TimelineId == timelineId);

        return timeline is null
            ? new KeyNotFoundException($"Timeline with id {timelineId} not found")
            : timeline;
    }

    public async Task InsertAsync(Timeline timeline) =>
        await _collection.InsertOneAsync(timeline);

    /// <summary>
    /// Inserts the timeline, or replaces the existing one with the same id.
    /// Re-running an import should refresh a timeline, not stack up another copy of it.
    /// </summary>
    /// <returns>True when an existing timeline was replaced.</returns>
    public async Task<bool> UpsertAsync(Timeline timeline)
    {
        var existing = _collection.AsQueryable().Any(t => t.TimelineId == timeline.TimelineId);

        if (existing)
            await _collection.ReplaceOneAsync(t => t.TimelineId == timeline.TimelineId, timeline);
        else
            await _collection.InsertOneAsync(timeline);

        return existing;
    }

    public async Task<Result> UpdateTimelineInfoAsync(UpdateTimelineInfoRequest request)
    {
        var dbTimeline = await GetAsync(request.TimelineId);

        if(!dbTimeline.IsSuccess)
            return dbTimeline.Exception;

        var timelineOut = dbTimeline.Value with
        {
            TimelineInfo = request.TimelineInfo
        };

        await _collection.ReplaceOneAsync(t => t.TimelineId == request.TimelineId, timelineOut);
        return Results.Success;
    }

    public async Task<Result<IEnumerable<Category>>> GetCategoriesAsync(Guid timelineId)
    {
        var timeline = await GetAsync(timelineId);
        return timeline.IsSuccess switch
        {
            false => timeline.Exception,
            _ => timeline.Value.Categories.ToList()
        };
    }

    public async Task<Result<Category>> GetCategoryAsync(Guid categoryId)
    {
        var category = (await GetAllAsync())
            .SelectMany(x => x.Categories)
            .SingleOrDefault(x => x.CategoryId == categoryId);

        return category is null
            ? new KeyNotFoundException($"Category with id {categoryId} not found")
            : category;
    }

    public async Task<Result<Episode>> GetEpisodeAsync(Guid episodeId)
    {
        var episode = (await GetAllAsync())
            .SelectMany(x => x.Episodes)
            .SingleOrDefault(x => x.EpisodeId == episodeId);

        return episode is null
            ? new KeyNotFoundException($"Episode with id {episodeId} not found")
            : episode;
    }

    public async Task<Result<Category>> InsertCategoryAsync(InsertCategoryRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        if(!timeline.IsSuccess)
            return timeline.Exception;

        var newCategory = new Category
        {
            CategoryId = Guid.CreateVersion7(),
            Confidentiality = request.Confidentiality,
            Title = request.Title,
            Subtitle = request.Subtitle,
            SortOrder = request.SortOrder,
            Icon = request.Icon
        };

        timeline.Value.Categories.Add(newCategory);
        await _collection
            .ReplaceOneAsync(t => t.TimelineId == request.TimelineId, timeline.Value);
        return newCategory;
    }

    public async Task<Result> UpdateCategoryAsync(UpdateCategoryRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        if(!timeline.IsSuccess)
            return timeline.Exception;

        var category = await GetCategoryAsync(request.Category.CategoryId);

        if(!category.IsSuccess)
            return category.Exception;

        timeline.Value.Categories.Remove(category.Value);

        timeline.Value.Categories.Add(category.Value with
        {
            Confidentiality = request.Category.Confidentiality,
            Title = request.Category.Title,
            Subtitle = request.Category.Subtitle,
            SortOrder = request.Category.SortOrder,
            Icon = request.Category.Icon
        });

        await _collection
            .ReplaceOneAsync(t => t.TimelineId == request.TimelineId, timeline.Value);
        return Results.Success;
    }

    /// <summary>
    /// Removes a category from its timeline.
    ///
    /// Episodes keep the category id they were tagged with. They are left in the file
    /// untouched and simply stop being drawn, since the layout only draws episodes whose
    /// category it can resolve. Deleting a category is therefore not a way to delete
    /// episodes, and nothing is lost that could not be recovered by recreating the
    /// category with the same id.
    /// </summary>
    public async Task<Result> DeleteCategoryAsync(Guid categoryId)
    {
        var timeline = (await GetAllAsync())
            .SingleOrDefault(t => t.Categories.Any(c => c.CategoryId == categoryId));

        if (timeline is null)
            return new KeyNotFoundException($"Category with id {categoryId} not found");

        var category = timeline.Categories.Single(c => c.CategoryId == categoryId);
        timeline.Categories.Remove(category);

        await _collection.ReplaceOneAsync(t => t.TimelineId == timeline.TimelineId, timeline);
        return Results.Success;
    }

    public async Task<Result<Episode>> InsertEpisodeAsync(InsertEpisodeRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        if(!timeline.IsSuccess)
            return timeline.Exception;

        var newEpisode = new Episode
        {
            EpisodeId = Guid.CreateVersion7(),
            Confidentiality = request.Confidentiality,
            Title = request.Title,
            Subtitle = request.Subtitle,
            Description = request.Description,
            Url = request.Url,
            UrlDescription = request.UrlDescription,
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

        timeline.Value.Episodes.Add(newEpisode);
        await _collection.ReplaceOneAsync(t => t.TimelineId == request.TimelineId, timeline.Value);
        return newEpisode;
    }

    /// <summary>
    /// Permanently removes an episode from its timeline.
    ///
    /// Unlike removing a category, which only stops episodes being drawn, this discards the
    /// record. Nothing else refers to an episode, so there is nothing left dangling — and
    /// nothing to recover it from either, short of a backup.
    /// </summary>
    public async Task<Result> DeleteEpisodeAsync(Guid episodeId)
    {
        var timeline = (await GetAllAsync())
            .SingleOrDefault(t => t.Episodes.Any(e => e.EpisodeId == episodeId));

        if (timeline is null)
            return new KeyNotFoundException($"Episode with id {episodeId} not found");

        var episode = timeline.Episodes.Single(e => e.EpisodeId == episodeId);
        timeline.Episodes.Remove(episode);

        await _collection.ReplaceOneAsync(t => t.TimelineId == timeline.TimelineId, timeline);
        return Results.Success;
    }

    public async Task<Result> UpdateEpisodeAsync(UpdateEpisodeRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        if(!timeline.IsSuccess)
            return timeline.Exception;

        var episode = await GetEpisodeAsync(request.Episode.EpisodeId);

        if(!episode.IsSuccess)
            return episode.Exception;

        timeline.Value.Episodes.Remove(episode.Value);

        var updatedEpisode = episode.Value with
        {
            Confidentiality = request.Episode.Confidentiality,
            Title = request.Episode.Title,
            Subtitle = request.Episode.Subtitle,
            Description = request.Episode.Description,
            Url = request.Episode.Url,
            UrlDescription = request.Episode.UrlDescription,
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

        timeline.Value.Episodes.Add(updatedEpisode);

        await _collection
            .ReplaceOneAsync(t => t.TimelineId == request.TimelineId, timeline.Value);
        return Results.Success;
    }
}


