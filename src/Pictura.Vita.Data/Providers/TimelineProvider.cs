using JsonFlatFileDataStore;

namespace Pictura.Vita.Data.Providers;

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

    public async Task<Result> UpdateTimelineInfoAsync(Timeline timelineIn)
    {
        var dbTimeline = await GetAsync(timelineIn.TimelineId);

        if(!dbTimeline.IsSuccess)
            return dbTimeline.Exception;

        var timelineOut = dbTimeline.Value with
        {
            TimelineInfo = timelineIn.TimelineInfo
        };

        await _collection.UpdateOneAsync(t => t.TimelineId == timelineIn.TimelineId, timelineOut);
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
            Subtitle = request.Subtitle
        };

        timeline.Value.Categories.Add(newCategory);
        await _collection
            .UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
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
            Subtitle = request.Category.Subtitle
        });

        await _collection
            .UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
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
            EpisodeType = request.Start.Equals(request.End) ? EpisodeType.Incident : EpisodeType.Era,
            StartPrecision = request.StartPrecision,
            Start = request.Start,
            EndPrecision = request.EndPrecision,
            End = request.End,
            Duration = request.End.Difference(request.Start).Days,
            CategoryIds = request.CategoryIds
        };

        timeline.Value.Episodes.Add(newEpisode);
        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
        return newEpisode;
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
            EpisodeType = request.Episode.EpisodeType,
            StartPrecision = request.Episode.StartPrecision,
            Start = request.Episode.Start,
            EndPrecision = request.Episode.EndPrecision,
            End = request.Episode.End,
            Duration = request.Episode.Duration(),
            CategoryIds = request.Episode.CategoryIds
        };

        timeline.Value.Episodes.Add(updatedEpisode);

        await _collection
            .UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
        return Results.Success;
    }
}


