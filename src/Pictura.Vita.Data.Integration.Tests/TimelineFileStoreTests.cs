using AutoFixture;
using AutoFixture.AutoMoq;
using FluentAssertions;
using Pictura.Vita.Data.Integration.Tests.Fixtures;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Domain;

namespace Pictura.Vita.Data.Integration.Tests;

/// <summary>
/// The rules that hold a timeline directory together: what counts as a timeline, what happens
/// when the id in the file disagrees with the directory holding it, and that a write which
/// fails leaves the previous file where it was.
///
/// Each test gets its own root rather than sharing the seeded fixture, because they are about
/// directories that should <em>not</em> be there.
/// </summary>
public class TimelineFileStoreTests : IDisposable
{
    private readonly Fixture _autoFixture;

    private readonly string _root;

    private readonly TimelineFileStore _sut;

    public TimelineFileStoreTests()
    {
        _root = Path.Combine(Path.GetTempPath(), $"pictura-vita-store-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(_root);

        _autoFixture = new Fixture();
        _autoFixture.Customize(
            new CompositeCustomization(
                new AutoMoqCustomization(),
                new SupportMutableValueTypesCustomization(),
                new DateOnlyFixtureCustomization()));

        _sut = new TimelineFileStore(_root);
    }

    [Fact]
    public async Task WriteAsync_ThenReadAsync_RoundTripsTheTimeline()
    {
        // arrange
        var timeline = _autoFixture.Create<Timeline>();

        // act
        (await _sut.WriteAsync(timeline)).IsSuccess.Should().BeTrue();
        var read = await _sut.ReadAsync(timeline.TimelineId);

        // assert
        read.IsSuccess.Should().BeTrue();
        read.Value.Should().BeEquivalentTo(timeline);
    }

    [Fact]
    public async Task WriteAsync_PutsTheFileWhereTheIdSaysItGoes()
    {
        // arrange
        var timeline = _autoFixture.Create<Timeline>();

        // act
        await _sut.WriteAsync(timeline);

        // assert — the directory name is the identity, and images/ and narratives/ are resolved
        // from it, so this path is the whole of what makes a timeline one portable folder.
        File.Exists(Path.Combine(_root, timeline.TimelineId.ToString(), "data.v1.json"))
            .Should()
            .BeTrue();
    }

    [Fact]
    public async Task CreateAsync_LaysOutTheWholeFolder()
    {
        // arrange
        var timeline = _autoFixture.Create<Timeline>();

        // act
        var created = await _sut.CreateAsync(timeline);

        // assert — images/ and narratives/ up front, so a folder handed to someone else shows
        // what belongs in it rather than looking like a lone JSON file.
        created.IsSuccess.Should().BeTrue();

        var directory = Path.Combine(_root, timeline.TimelineId.ToString());
        File.Exists(Path.Combine(directory, "data.v1.json")).Should().BeTrue();
        Directory.Exists(Path.Combine(directory, "images")).Should().BeTrue();
        Directory.Exists(Path.Combine(directory, "narratives")).Should().BeTrue();
    }

    [Fact]
    public async Task CreateAsync_RefusesToLandOnATimelineThatIsAlreadyThere()
    {
        // arrange
        var timeline = _autoFixture.Create<Timeline>();
        await _sut.CreateAsync(timeline);

        // act — the same id twice, which for a new timeline means a colliding Guid and for a
        // restore means the timeline is already in the directory.
        var again = await _sut.CreateAsync(timeline with
        {
            TimelineInfo = timeline.TimelineInfo with { Title = "Would have overwritten" }
        });

        // assert
        again.IsSuccess.Should().BeFalse();

        var onDisk = await _sut.ReadAsync(timeline.TimelineId);
        onDisk.Value.TimelineInfo.Title.Should().Be(timeline.TimelineInfo.Title);
    }

    [Fact]
    public void Ids_IgnoresDirectoriesThatAreNotTimelines()
    {
        // arrange — the sort of thing that turns up in a directory a person keeps files in.
        Directory.CreateDirectory(Path.Combine(_root, "not-a-guid"));
        Directory.CreateDirectory(Path.Combine(_root, Guid.CreateVersion7().ToString()));
        File.WriteAllText(Path.Combine(_root, ".DS_Store"), string.Empty);

        // act
        var ids = _sut.Ids();

        // assert — a directory named for a Guid but holding no data file is a half-finished
        // copy, not a timeline.
        ids.Should().BeEmpty();
    }

    [Fact]
    public async Task ReadAsync_GivenAnIdThatDisagreesWithItsDirectory_Refuses()
    {
        // arrange — what a directory copied under a new name looks like.
        var timeline = _autoFixture.Create<Timeline>();
        await _sut.WriteAsync(timeline);

        var impostor = Guid.CreateVersion7();
        Directory.CreateDirectory(Path.Combine(_root, impostor.ToString()));
        File.Copy(
            Path.Combine(_root, timeline.TimelineId.ToString(), "data.v1.json"),
            Path.Combine(_root, impostor.ToString(), "data.v1.json"));

        // act
        var read = await _sut.ReadAsync(impostor);

        // assert — not "not found", which would invite a caller to write over it.
        read.IsSuccess.Should().BeFalse();
        read.Exception.Should().BeOfType<InvalidDataException>();
    }

    [Fact]
    public async Task ReadAsync_GivenAnUnparseableFile_DoesNotReportItAsMissing()
    {
        // arrange
        var id = Guid.CreateVersion7();
        Directory.CreateDirectory(Path.Combine(_root, id.ToString()));
        File.WriteAllText(Path.Combine(_root, id.ToString(), "data.v1.json"), "{ not json");

        // act
        var read = await _sut.ReadAsync(id);

        // assert
        read.IsSuccess.Should().BeFalse();
        read.Exception.Should().BeOfType<InvalidDataException>();
    }

    [Fact]
    public async Task MutateAsync_GivenATransformThatFails_LeavesTheFileExactlyAsItWas()
    {
        // arrange
        var timeline = _autoFixture.Create<Timeline>();
        await _sut.WriteAsync(timeline);

        var path = Path.Combine(_root, timeline.TimelineId.ToString(), "data.v1.json");
        var before = await File.ReadAllBytesAsync(path);

        // act
        var result = await _sut.MutateAsync(
            timeline.TimelineId, _ => new KeyNotFoundException("nope"));

        // assert
        result.IsSuccess.Should().BeFalse();
        (await File.ReadAllBytesAsync(path)).Should().Equal(before);
    }

    /// <summary>
    /// The lock is taken outside the try, so a wait that is cancelled must not reach the
    /// Release in the finally. Getting that wrong releases a semaphore that was never
    /// acquired, which raises its count and lets two writers into the same file afterwards.
    /// </summary>
    [Fact]
    public async Task MutateAsync_GivenACancelledToken_DoesNotStrandTheLock()
    {
        // arrange
        var timeline = _autoFixture.Create<Timeline>();
        await _sut.WriteAsync(timeline);

        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();

        // act — cancellation is not a Result; it comes out as an exception.
        var act = async () => await _sut.MutateAsync(
            timeline.TimelineId,
            current => current with
            {
                TimelineInfo = current.TimelineInfo with { Title = "Should never be written" }
            },
            cancelled.Token);

        // assert
        await act.Should().ThrowAsync<OperationCanceledException>();

        (await _sut.ReadAsync(timeline.TimelineId)).Value.TimelineInfo.Title
            .Should()
            .Be(timeline.TimelineInfo.Title);

        // The next writer must still be able to take the lock. A SemaphoreFullException, or a
        // hang, is what a mismatched Release looks like from here.
        var after = await _sut.MutateAsync(timeline.TimelineId, current => current with
        {
            TimelineInfo = current.TimelineInfo with { Title = "Written afterwards" }
        });

        after.IsSuccess.Should().BeTrue();
        (await _sut.ReadAsync(timeline.TimelineId)).Value.TimelineInfo.Title
            .Should()
            .Be("Written afterwards");
    }

    [Fact]
    public async Task MutateAsync_LeavesNoTemporaryFilesBehind()
    {
        // arrange — the write goes to a temporary file and is then moved over the destination,
        // so a directory accumulating .tmp files would mean the move is not happening.
        var timeline = _autoFixture.Create<Timeline>();
        await _sut.WriteAsync(timeline);

        // act
        for (var i = 0; i < 5; i++)
            await _sut.MutateAsync(timeline.TimelineId, current =>
                current with { TimelineInfo = current.TimelineInfo with { Title = $"Edit {i}" } });

        // assert
        Directory.GetFiles(Path.Combine(_root, timeline.TimelineId.ToString()))
            .Select(Path.GetFileName)
            .Should()
            .BeEquivalentTo("data.v1.json");
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);

        GC.SuppressFinalize(this);
    }
}
