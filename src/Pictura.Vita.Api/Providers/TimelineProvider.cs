using JsonFlatFileDataStore;
using Pictura.Vita.Domain;

namespace Pictura.Vita.Api.Providers;

internal class TimelineProvider
{
    private readonly IDocumentCollection<Timeline> _collection;

    public TimelineProvider(IDocumentCollection<Timeline> collection)
    {
        var store = new DataStore(Environment.GetEnvironmentVariable("DATA_FILE_PATH"));
        _collection = store.GetCollection<Timeline>();
    }

    public IEnumerable<Timeline> GetAllAsync() =>
        _collection.AsQueryable();



}


