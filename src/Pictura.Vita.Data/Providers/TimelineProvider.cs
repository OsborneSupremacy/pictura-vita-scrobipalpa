using JsonFlatFileDataStore;
using Pictura.Vita.Domain;

namespace Pictura.Vita.Data.Providers;

public class TimelineProvider
{
    private readonly IDocumentCollection<Timeline> _collection;

    public TimelineProvider()
    {
        var store = new DataStore(Environment.GetEnvironmentVariable("DATA_FILE_PATH"));
        _collection = store.GetCollection<Timeline>();
    }

    public IEnumerable<Timeline> GetAll() =>
        _collection.AsQueryable();

    public Timeline? Get(Guid timelineId) =>
        _collection
            .AsQueryable()
            .SingleOrDefault(x => x.TimelineId == timelineId);

    public async Task InsertAsync(Timeline timeline) =>
        await _collection.InsertOneAsync(timeline);



}


