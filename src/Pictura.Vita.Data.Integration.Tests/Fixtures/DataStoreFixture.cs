using AutoFixture;
using AutoFixture.AutoMoq;
using JsonFlatFileDataStore;
using Pictura.Vita.Domain;

namespace Pictura.Vita.Data.Integration.Tests.Fixtures;

public class DataStoreFixture : IDisposable
{
    private readonly string _tempFile;

    public Fixture AutoFixture { get; }

    public IDataStore DataStore { get; private set; }

    public List<Timeline> GetTimelines() => DataStore
        .GetCollection<Timeline>()
        .AsQueryable()
        .ToList();

    /// <summary>
    /// Reads the timelines back through a *second* store over the same file.
    ///
    /// The usual accessor reads the live in-memory collection, which shows changes that were
    /// only ever made to the cached objects and never written. Opening the file again is the
    /// only way to prove a write actually reached disk.
    /// </summary>
    public List<Timeline> GetTimelinesFromDisk()
    {
        using var reopened = new DataStore(_tempFile);
        return reopened.GetCollection<Timeline>().AsQueryable().ToList();
    }

    public DataStoreFixture()
    {
        _tempFile = Path.Combine(Path.GetTempPath(), $"-timeline-data-{Guid.CreateVersion7()}.json");
        Console.WriteLine($"Using temporary file: {_tempFile}");

        AutoFixture = new Fixture();
        AutoFixture.Customize(
            new CompositeCustomization(
                new AutoMoqCustomization(),
                new SupportMutableValueTypesCustomization(),
                new DateOnlyFixtureCustomization()
            )
        );

        if (File.Exists(_tempFile))
            File.Delete(_tempFile);

        DataStore = new DataStore(_tempFile);

        var collection = DataStore.GetCollection<Timeline>();
        collection.InsertMany(AutoFixture.CreateMany<Timeline>(10));
    }

    private void Dispose(bool disposing)
    {
        File.Delete(_tempFile);
        if (disposing)
            DataStore.Dispose();
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    ~DataStoreFixture() => Dispose(false);
}

public class DateOnlyFixtureCustomization: ICustomization
{

    void ICustomization.Customize(IFixture fixture)
    {
        fixture.Customize<DateOnly>(composer => composer.FromFactory<DateTime>(DateOnly.FromDateTime));
    }
}