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

    public async Task UpdateCategoryAsync(UpdateCategoryRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        var category = timeline.Categories
            .Single(x => x.CategoryId == request.Category.CategoryId);

        timeline.Categories.Remove(category);

        timeline.Categories.Add(category with
        {
            Confidentiality = request.Category.Confidentiality,
            Title = request.Category.Title,
            Subtitle = request.Category.Subtitle
        });

        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
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

    public async Task UpdateEpisodeAsync(UpdateEpisodeRequest request)
    {
        var timeline = await GetAsync(request.TimelineId);

        var episode = timeline.Episodes
            .Single(x => x.EpisodeId == request.Episode.EpisodeId);

        timeline.Episodes.Remove(episode);

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

        timeline.Episodes.Add(updatedEpisode);

        await _collection.UpdateOneAsync(t => t.TimelineId == request.TimelineId, timeline);
    }
}


