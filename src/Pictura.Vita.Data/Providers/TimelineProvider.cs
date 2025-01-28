using JsonFlatFileDataStore;
using Pictura.Vita.Domain;
using Pictura.Vita.Messaging;

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

    public async Task InsertCategoryAsync(InsertCategoryRequest request)
    {
        var timeline = await GetAsync(request.TimelineId)!;
        timeline.Categories.Add(request.Category);
        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
    }

    public async Task InsertEventAsync(InsertEventRequest request)
    {
        var timeline = await GetAsync(request.TimelineId)!;
        timeline.Episodes.Add(request.Episode);
        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
    }



}


