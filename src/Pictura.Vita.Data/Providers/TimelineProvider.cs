using JsonFlatFileDataStore;
using Pictura.Vita.Domain;
using Pictura.Vita.Messaging;
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

    public async Task<Timeline> GetAsync(Guid timelineId) =>
        (await GetAllAsync())
            .Single(x => x.TimelineId == timelineId);

    public async Task InsertAsync(Timeline timeline) =>
        await _collection.InsertOneAsync(timeline);

    public async Task<IEnumerable<Category>> GetCategoriesAsync(Guid timelineId) =>
        (await GetAsync(timelineId))
            .Categories;

    public async Task<Category> GetCategoryAsync(Guid categoryId) =>
        (await GetAllAsync())
            .SelectMany(x => x.Categories)
            .Single(x => x.CategoryId == categoryId);

    public async Task<Episode> GetEpisodeAsync(Guid episodeId) =>
        (await GetAllAsync())
            .SelectMany(x => x.Episodes)
            .Single(x => x.EpisodeId == episodeId);

    public async Task<Category> InsertCategoryAsync(InsertCategoryRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        var newCategory = new Category
        {
            CategoryId = Guid.CreateVersion7(),
            Confidentiality = request.Confidentiality,
            Title = request.Title,
            Subtitle = request.Subtitle
        };

        timeline.Categories.Add(newCategory);
        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
        return newCategory;
    }

    public async Task<Episode> InsertEpisodeAsync(InsertEpisodeRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

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

        timeline.Episodes.Add(newEpisode);
        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
        return newEpisode;
    }



}


