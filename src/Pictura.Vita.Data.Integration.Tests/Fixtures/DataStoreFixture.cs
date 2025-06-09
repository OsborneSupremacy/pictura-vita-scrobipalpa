using AutoFixture;
using AutoFixture.AutoMoq;
using JsonFlatFileDataStore;
using Pictura.Vita.Domain;

namespace Pictura.Vita.Data.Integration.Tests.Fixtures;

public class DataStoreFixture : IDisposable
{
    private readonly string _tempFile;

    public IDataStore DataStore { get; private set; }

    public DataStoreFixture()
    {
        _tempFile = Path.Combine(Path.GetTempPath(), $"-timeline-data-{Guid.NewGuid()}.json");
        Console.WriteLine($"Using temporary file: {_tempFile}");

        var autoFixture = new Fixture();
        autoFixture.Customize(
            new CompositeCustomization(
                new AutoMoqCustomization(),
                new SupportMutableValueTypesCustomization())
        );

        if (File.Exists(_tempFile))
            File.Delete(_tempFile);

        DataStore = new DataStore(_tempFile);
        
        var collection = DataStore.GetCollection<Timeline>();
        collection.InsertOne(new Timeline
        {
            TimelineId = Guid.NewGuid(),
            TimelineInfo = new TimelineInfo
            {
                Title = "Test Timeline",
                Subtitle = "This is a test timeline.",
                TimelineSubject = new()
                {
                    SubjectType = SubjectType.Person,
                    Organization = Organizations.Empty,
                    Person = new()
                    {
                        NameParts = [],
                        ObfuscateDates = false,
                        BirthPrecision = DatePrecision.Exact,
                        Birth = default,
                        DeathPrecision = DatePrecision.Exact,
                        Death = default
                    }
                },
                Start = default,
                End = default
            },
            Categories = new List<Category>(),
            Episodes = []
        });
    }

    private void ReleaseUnmanagedResources() => File.Delete(_tempFile);

    private void Dispose(bool disposing)
    {
        ReleaseUnmanagedResources();
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