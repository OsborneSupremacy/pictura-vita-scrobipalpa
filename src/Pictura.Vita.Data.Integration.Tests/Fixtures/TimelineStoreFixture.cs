using AutoFixture;
using AutoFixture.AutoMoq;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Domain;

namespace Pictura.Vita.Data.Integration.Tests.Fixtures;

/// <summary>
/// A throwaway timelines root, seeded with fabricated timelines — one directory each, exactly
/// as the application lays them out on disk.
/// </summary>
public class TimelineStoreFixture : IDisposable
{
    private const int SeededTimelines = 10;

    private readonly string _root;

    public Fixture AutoFixture { get; }

    public TimelineFileStore Store { get; }

    /// <summary>Every seeded timeline, in whatever order the file system lists them.</summary>
    public async Task<List<Timeline>> GetTimelinesAsync() => await ReadAllAsync(Store);

    /// <summary>
    /// Reads the timelines back through a <em>second</em> store over the same root.
    ///
    /// The previous store kept an in-memory collection, and reading it showed changes that had
    /// only ever been made to the cached objects and never written; opening the file again was
    /// the only way to prove a write reached disk. <see cref="TimelineFileStore"/> holds no
    /// such cache, so this now agrees with <see cref="GetTimelinesAsync"/> by construction —
    /// which is the point. The assertions that use it are stating "this reached the file", and
    /// they should go on saying so even though nothing is left that could make them disagree.
    /// </summary>
    public async Task<List<Timeline>> GetTimelinesFromDiskAsync() =>
        await ReadAllAsync(new TimelineFileStore(_root));

    public TimelineStoreFixture()
    {
        _root = Path.Combine(Path.GetTempPath(), $"pictura-vita-tests-{Guid.CreateVersion7()}");
        Console.WriteLine($"Using temporary timelines root: {_root}");

        Directory.CreateDirectory(_root);

        AutoFixture = new Fixture();
        AutoFixture.Customize(
            new CompositeCustomization(
                new AutoMoqCustomization(),
                new SupportMutableValueTypesCustomization(),
                new DateOnlyFixtureCustomization()
            )
        );

        Store = new TimelineFileStore(_root);

        foreach (var timeline in AutoFixture.CreateMany<Timeline>(SeededTimelines))
        {
            var written = Store.WriteAsync(timeline).GetAwaiter().GetResult();

            if (written.IsFaulted) throw written.Exception;
        }
    }

    private static async Task<List<Timeline>> ReadAllAsync(TimelineFileStore store)
    {
        var timelines = new List<Timeline>();

        foreach (var id in store.Ids())
        {
            var timeline = await store.ReadAsync(id);

            if (timeline.IsFaulted) throw timeline.Exception;

            timelines.Add(timeline.Value);
        }

        return timelines;
    }

    private void Dispose(bool disposing)
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);

        if (disposing) GC.SuppressFinalize(this);
    }

    public void Dispose() => Dispose(true);

    ~TimelineStoreFixture() => Dispose(false);
}

public class DateOnlyFixtureCustomization : ICustomization
{
    void ICustomization.Customize(IFixture fixture)
    {
        fixture.Customize<DateOnly>(composer => composer.FromFactory<DateTime>(DateOnly.FromDateTime));
    }
}
