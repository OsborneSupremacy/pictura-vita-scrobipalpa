using JsonFlatFileDataStore;
using Pictura.Vita.Domain;
using Pictura.Vita.Messaging;
using Pictura.Vita.Utility;
using Pictura.Vita.Utility.Extensions;

namespace Pictura.Vita.Data.Providers;

public class TimelineProvider
{
    private readonly IDocumentCollection<Timeline> _collection;

    public TimelineProvider()
    {
        var store = new DataStore(Environment.GetEnvironmentVariable("DATA_FILE_PATH"));
        _collection = store.GetCollection<Timeline>();
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
            ? new Result<Timeline>(new KeyNotFoundException())
            : new Result<Timeline>(timeline);
    }

    public async Task InsertAsync(Timeline timeline) =>
        await _collection.InsertOneAsync(timeline);

    public async Task<Result<IEnumerable<Category>>> GetCategoriesAsync(Guid timelineId)
    {
        var timeline = await GetAsync(timelineId);
        return timeline.IsSuccess switch
        {
            false => new Result<IEnumerable<Category>>(timeline.Exception),
            _ => new Result<IEnumerable<Category>>(timeline.Value.Categories.AsEnumerable())
        };
    }

    public async Task<Result<Category>> GetCategoryAsync(Guid categoryId)
    {
        var category = (await GetAllAsync())
            .SelectMany(x => x.Categories)
            .SingleOrDefault(x => x.CategoryId == categoryId);

        return category is null
            ? new Result<Category>(new KeyNotFoundException($"Category with id {categoryId} not found"))
            : new Result<Category>(category);
    }

    public async Task<Result<Episode>> GetEpisodeAsync(Guid episodeId)
    {
        var episode = (await GetAllAsync())
            .SelectMany(x => x.Episodes)
            .SingleOrDefault(x => x.EpisodeId == episodeId);

        return episode is null
            ? new Result<Episode>(new KeyNotFoundException($"Episode with id {episodeId} not found"))
            : new Result<Episode>(episode);
    }

    public async Task<Result<Category>> InsertCategoryAsync(InsertCategoryRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        if(!timeline.IsSuccess)
            return new Result<Category>(timeline.Exception);

        var newCategory = new Category
        {
            CategoryId = Guid.CreateVersion7(),
            Confidentiality = request.Confidentiality,
            Title = request.Title,
            Subtitle = request.Subtitle
        };

        timeline.Value.Categories.Add(newCategory);
        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
        return new Result<Category>(newCategory);
    }

    public async Task<Result<bool>> UpdateCategoryAsync(UpdateCategoryRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        if(!timeline.IsSuccess)
            return new Result<bool>(timeline.Exception);

        var category = timeline.Value.Categories
            .Single(x => x.CategoryId == request.Category.CategoryId);

        timeline.Value.Categories.Remove(category);

        timeline.Value.Categories.Add(category with
        {
            Confidentiality = request.Category.Confidentiality,
            Title = request.Category.Title,
            Subtitle = request.Category.Subtitle
        });

        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
        return new Result<bool>(true);
    }

    public async Task<Result<Episode>> InsertEpisodeAsync(InsertEpisodeRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        if(!timeline.IsSuccess)
            return new Result<Episode>(timeline.Exception);

        var newEpisode = new Episode
        {
            EpisodeId = Guid.CreateVersion7(),
            Confidentiality = request.Confidentiality,
            Title = request.Title,
            Subtitle = request.Subtitle,
            Description = request.Description,
            Url = request.Url,
            UrlDescription = request.UrlDescription,
            EpisodeType = request.EpisodeType,
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

    public async Task<Result<bool>> UpdateEpisodeAsync(UpdateEpisodeRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        if(!timeline.IsSuccess)
            return new Result<bool>(timeline.Exception);

        var episode = timeline.Value.Episodes
            .Single(x => x.EpisodeId == request.Episode.EpisodeId);

        timeline.Value.Episodes.Remove(episode);

        var updatedEpisode = episode with
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
            Duration = request.Episode.End.Difference(request.Episode.Start).Days,
            CategoryIds = request.Episode.CategoryIds
        };

        timeline.Value.Episodes.Add(updatedEpisode);

        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
        return new Result<bool>(true);
    }
}


