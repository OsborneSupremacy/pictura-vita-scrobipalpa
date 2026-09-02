using AutoFixture;
using FluentAssertions;
using Pictura.Vita.Data.Integration.Tests.Fixtures;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Domain;
using Pictura.Vita.Messaging;

namespace Pictura.Vita.Data.Integration.Tests;

public class TimelineProviderTests : IClassFixture<TimelineStoreFixture>
{
    private readonly TimelineStoreFixture _fixture;

    public TimelineProviderTests(TimelineStoreFixture fixture)
    {
        _fixture = fixture ?? throw new ArgumentNullException(nameof(fixture));
    }

    [Fact]
    public async Task GetAllSummariesAsync_ReturnsOneSummaryPerTimelineOnDisk()
    {
        // arrange
        var expected = (await _fixture.GetTimelinesAsync()).ToList();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = (await sut.GetAllSummariesAsync()).ToList();

        // assert
        result.Should().HaveCount(expected.Count);
        result.Select(s => s.TimelineId).Should().BeEquivalentTo(expected.Select(t => t.TimelineId));

        // The counts are what make the table of contents worth drawing, so they are worth
        // checking rather than assuming.
        var sample = expected.First();
        result.Single(s => s.TimelineId == sample.TimelineId)
            .Should()
            .Match<TimelineSummary>(s =>
                s.Title == sample.TimelineInfo.Title
                && s.EpisodeCount == sample.Episodes.Count
                && s.CategoryCount == sample.Categories.Count);
    }

    /// <summary>
    /// The listing is cached against each file's last-write time and length, so a write has to
    /// be visible on the very next call. Nothing invalidates the cache explicitly — if the
    /// staleness check is wrong, a rename made in the app never reaches the table of contents.
    /// </summary>
    [Fact]
    public async Task GetAllSummariesAsync_SeesATitleChangedSinceTheLastListing()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).Last();
        var sut = new TimelineProvider(_fixture.Store);

        _ = await sut.GetAllSummariesAsync();

        // act
        await sut.UpdateTimelineInfoAsync(new UpdateTimelineInfoRequest
        {
            TimelineId = timeline.TimelineId,
            TimelineInfo = timeline.TimelineInfo with { Title = "Renamed since the last listing" }
        });

        // assert
        (await sut.GetAllSummariesAsync())
            .Single(s => s.TimelineId == timeline.TimelineId)
            .Title.Should()
            .Be("Renamed since the last listing");
    }

    [Fact]
    public async Task GetTimelineAsync_GivenValidTimelineId_ReturnsTimeline()
    {
        // arrange
        var timelineId = (await _fixture.GetTimelinesAsync()).First().TimelineId;

        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = (await sut.GetAsync(timelineId)).Value;

        // assert
        result.Should()
            .NotBeNull()
            .And.BeOfType<Timeline>()
            .And.Match<Timeline>(x => x.TimelineId == timelineId);
    }

    [Fact]
    public async Task GetTimelineAsync_GivenInvalidTimelineId_ReturnsNotFound()
    {
        // arrange
        var sut = new TimelineProvider(_fixture.Store);
        var invalidId = Guid.CreateVersion7();

        // act
        var result = await sut.GetAsync(invalidId);

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateTimelineInfoAsync_GivenValidRequest_UpdatesTimeline()
    {
        // arrange
        var timelineIn = (await _fixture.GetTimelinesAsync()).First();

        var updatedTimeline = timelineIn with
        {
            TimelineInfo = _fixture
                .AutoFixture
                .Create<TimelineInfo>()
        };

        var sut = new TimelineProvider(_fixture.Store);

        // act
        await sut.UpdateTimelineInfoAsync(new UpdateTimelineInfoRequest
        {
            TimelineId = timelineIn.TimelineId,
            TimelineInfo = updatedTimeline.TimelineInfo
        });

        var timelineOut = (await sut.GetAsync(timelineIn.TimelineId)).Value;

        // assert
        timelineOut.Should().BeEquivalentTo(updatedTimeline);
    }

    [Fact]
    public async Task UpdateTimelineInfoAsync_LeavesEpisodesAndCategoriesUntouched()
    {
        // arrange
        var timelineIn = (await _fixture.GetTimelinesAsync()).First();
        var sut = new TimelineProvider(_fixture.Store);

        // act - editing the subject must not disturb the timeline's contents
        await sut.UpdateTimelineInfoAsync(new UpdateTimelineInfoRequest
        {
            TimelineId = timelineIn.TimelineId,
            TimelineInfo = timelineIn.TimelineInfo with { Title = "Renamed" }
        });

        var timelineOut = (await sut.GetAsync(timelineIn.TimelineId)).Value;

        // assert
        timelineOut.TimelineInfo.Title.Should().Be("Renamed");
        timelineOut.Episodes.Should().BeEquivalentTo(timelineIn.Episodes);
        timelineOut.Categories.Should().BeEquivalentTo(timelineIn.Categories);
    }

    [Fact]
    public async Task UpdateTimelineInfoAsync_GivenUnknownTimeline_ReturnsNotFound()
    {
        // arrange
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.UpdateTimelineInfoAsync(new UpdateTimelineInfoRequest
        {
            TimelineId = Guid.CreateVersion7(),
            TimelineInfo = _fixture.AutoFixture.Create<TimelineInfo>()
        });

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    /// <summary>
    /// A listing served entirely from the summary cache awaits nothing, so it would run to the
    /// end of the directory however long ago the caller gave up. The check at the top of the
    /// loop is the only thing that stops it.
    /// </summary>
    [Fact]
    public async Task GetAllSummariesAsync_GivenACancelledToken_StopsEvenWhenFullyCached()
    {
        // arrange — prime the cache, so nothing in the second call would otherwise await.
        var sut = new TimelineProvider(_fixture.Store);
        _ = await sut.GetAllSummariesAsync();

        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();

        // act
        var act = async () => await sut.GetAllSummariesAsync(cancelled.Token);

        // assert
        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    /// <summary>
    /// Runs against a root of its own rather than the shared fixture.
    ///
    /// A created timeline is empty, and every other test in this class arranges with
    /// <c>.First()</c> and then reaches for <c>Episodes.First()</c> or
    /// <c>Categories.First()</c>. Adding an empty timeline to the shared root made those fail
    /// whenever the file system happened to enumerate the new directory first — an
    /// intermittent failure that had nothing to do with the code under test.
    /// </summary>
    [Fact]
    public async Task CreateAsync_AddsATimelineToTheDirectory()
    {
        // arrange
        var root = Path.Combine(Path.GetTempPath(), $"pictura-vita-create-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(root);

        try
        {
            var sut = new TimelineProvider(new TimelineFileStore(root));

            // act
            var created = await sut.CreateAsync(new CreateTimelineRequest
            {
                TimelineInfo = _fixture.AutoFixture.Create<TimelineInfo>()
            });

            // assert
            created.IsSuccess.Should().BeTrue();

            // Neither is empty: a new timeline starts with default categories, because one with
            // none draws nothing whatever you put in it — and with a placeholder in each,
            // because a category with no episodes does not draw either.
            created.Value.Categories.Should().NotBeEmpty();
            created.Value.Episodes.Should().HaveCount(created.Value.Categories.Count);

            // The id is the server's, and it names the directory — a caller has nothing to
            // construct the location from except what comes back.
            created.Value.TimelineId.Should().NotBe(Guid.Empty);

            (await sut.GetAllSummariesAsync())
                .Should()
                .ContainSingle(s => s.TimelineId == created.Value.TimelineId);

            // Read back through a second store, to prove it reached disk rather than a cache.
            var onDisk = await new TimelineFileStore(root).ReadAsync(created.Value.TimelineId);
            onDisk.IsSuccess.Should().BeTrue();
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData(SubjectType.Person)]
    [InlineData(SubjectType.Organization)]
    public async Task CreateAsync_SeedsTheDefaultCategoriesForTheSubject(SubjectType subjectType)
    {
        // arrange — its own root, for the reason on the test above.
        var root = Path.Combine(Path.GetTempPath(), $"pictura-vita-seed-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(root);

        try
        {
            var sut = new TimelineProvider(new TimelineFileStore(root));

            var info = _fixture.AutoFixture.Create<TimelineInfo>();

            // act
            var created = await sut.CreateAsync(new CreateTimelineRequest
            {
                TimelineInfo = info with
                {
                    TimelineSubject = info.TimelineSubject with { SubjectType = subjectType }
                }
            });

            // assert
            created.IsSuccess.Should().BeTrue();
            created.Value.Categories.Should().BeEquivalentTo(
                DefaultCategories.For(subjectType),
                // The ids are new on every call by design, so they cannot match.
                options => options.Excluding(c => c.CategoryId));

            // Every band needs an icon and a place in the order, and the order has to be the
            // contiguous run the categories dialog renumbers to.
            created.Value.Categories.Should().OnlyContain(c => c.Icon.Length > 0);
            created.Value.Categories.Select(c => c.SortOrder)
                .Should()
                .BeEquivalentTo(Enumerable.Range(0, created.Value.Categories.Count));

            // And it is on disk, not just in the answer.
            var onDisk = await new TimelineFileStore(root).ReadAsync(created.Value.TimelineId);
            onDisk.Value.Categories.Should().HaveCount(created.Value.Categories.Count);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData(SubjectType.Person)]
    [InlineData(SubjectType.Organization)]
    public async Task CreateAsync_PutsOnePlaceholderInEveryDefaultCategory(SubjectType subjectType)
    {
        // arrange — its own root, for the reason on the creation test above.
        var root = Path.Combine(Path.GetTempPath(), $"pictura-vita-holder-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(root);

        try
        {
            var sut = new TimelineProvider(new TimelineFileStore(root));
            var info = _fixture.AutoFixture.Create<TimelineInfo>();

            // act
            var created = await sut.CreateAsync(new CreateTimelineRequest
            {
                TimelineInfo = info with
                {
                    TimelineSubject = info.TimelineSubject with { SubjectType = subjectType }
                }
            });

            // assert
            var timeline = created.Value;

            timeline.Episodes.Should().OnlyContain(e =>
                e.Title == PlaceholderEpisodes.Title && e.Subtitle == PlaceholderEpisodes.Subtitle);

            // One apiece, each carrying its own category and nothing else — a placeholder tagged
            // with two categories would draw a bar in both and read as real data.
            timeline.Episodes.Should().OnlyContain(e => e.CategoryIds.Count == 1);
            timeline.Episodes.SelectMany(e => e.CategoryIds)
                .Should()
                .BeEquivalentTo(timeline.Categories.Select(c => c.CategoryId));

            // A single day, which is what makes the layout draw it as a callout rather than a
            // bar spanning a life nobody has recorded yet.
            timeline.Episodes.Should().OnlyContain(e =>
                e.EpisodeType == EpisodeType.Incident && e.Start == e.End && !e.Indefinite);

            // Ids are per-episode, not shared, exactly as for the categories.
            timeline.Episodes.Select(e => e.EpisodeId).Should().OnlyHaveUniqueItems();
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    /// <summary>
    /// A placeholder nobody can see does not do the one job it has. Today — what the episode
    /// dialog uses for a new episode — is inside the drawn window only while a timeline is
    /// ongoing; on one that ended in the past it falls outside it.
    /// </summary>
    [Fact]
    public async Task CreateAsync_PlacesPlaceholdersInsideTheWindowOfATimelineThatHasEnded()
    {
        // arrange
        var root = Path.Combine(Path.GetTempPath(), $"pictura-vita-window-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(root);

        try
        {
            var sut = new TimelineProvider(new TimelineFileStore(root));
            var info = _fixture.AutoFixture.Create<TimelineInfo>();

            var start = new DateOnly(1912, 4, 10);
            var end = new DateOnly(1912, 4, 15);

            // act
            var created = await sut.CreateAsync(new CreateTimelineRequest
            {
                TimelineInfo = info with { Start = start, End = end, Ongoing = false }
            });

            // assert
            created.Value.Episodes.Should().NotBeEmpty();
            created.Value.Episodes.Should().OnlyContain(e => e.Start >= start && e.End <= end);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    /// <summary>
    /// The defaults are built fresh per call rather than held in a static list. If they were
    /// cached, every timeline ever created would share one set of category ids — and an
    /// episode's CategoryIds would then resolve against whichever timeline was open.
    /// </summary>
    [Fact]
    public void DefaultCategories_GiveEveryTimelineItsOwnCategoryIds()
    {
        // act
        var first = DefaultCategories.For(SubjectType.Person);
        var second = DefaultCategories.For(SubjectType.Person);

        // assert
        first.Select(c => c.CategoryId)
            .Should()
            .NotIntersectWith(second.Select(c => c.CategoryId));

        first.Select(c => c.CategoryId).Should().OnlyHaveUniqueItems();
    }

    /// <summary>
    /// Icon names are Lucide's own kebab-case form, and the front end resolves them through
    /// CATEGORY_ICONS in web/pictura-vita-app/src/icons/registry.ts. Nothing here can check a
    /// name is in that registry — it is another language — so this checks the shape, and the
    /// registry stays the list to add a new name to.
    /// </summary>
    [Theory]
    [InlineData(SubjectType.Person)]
    [InlineData(SubjectType.Organization)]
    public void DefaultCategories_UseKebabCaseIconNames(SubjectType subjectType)
    {
        DefaultCategories.For(subjectType)
            .Should()
            .OnlyContain(c => c.Icon.All(character => char.IsAsciiLetterLower(character) || character == '-'));
    }

    [Fact]
    public async Task GetCategoriesAsync_GivenValidRequest_ReturnsCategories()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.GetCategoriesAsync(timeline.TimelineId);

        // assert — the timeline's own categories, not merely something list-shaped. This used
        // to call ToList() on the answer and then assert it was a List, which was a fact about
        // the test rather than about the provider.
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().BeEquivalentTo(timeline.Categories);
    }

    [Fact]
    public async Task GetCategoriesAsync_GivenInvalidTimelineId_ReturnsNotFound()
    {
        // arrange
        var sut = new TimelineProvider(_fixture.Store);
        var invalidId = Guid.CreateVersion7();

        // act
        var result = await sut.GetCategoriesAsync(invalidId);

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task InsertCategoryAsync_GivenValidRequest_InsertsCategory()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var request = new InsertCategoryRequest
        {
            TimelineId = timeline.TimelineId,
            Confidentiality = Confidentiality.Public,
            Title = "Test Category",
            Subtitle = "Test Subtitle",
            Description = "Test Description",
            SortOrder = 0,
            Icon = "star",
            Color = "#1e5799"
        };
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.InsertCategoryAsync(request);

        // assert
        result.IsSuccess.Should().BeTrue();
        result.Value.Should().NotBeNull();
        result.Value.Title.Should().Be(request.Title);
        result.Value.Subtitle.Should().Be(request.Subtitle);

        var categories = (await sut.GetCategoriesAsync(timeline.TimelineId)).Value;
        categories.Should().ContainSingle(c => c.CategoryId == result.Value.CategoryId);
    }

    [Fact]
    public async Task DeleteCategoryAsync_RemovesTheCategoryButLeavesEpisodesInPlace()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var category = timeline.Categories.First();
        var sut = new TimelineProvider(_fixture.Store);

        // Give the category an episode of its own; the fixture's episodes carry unrelated
        // category ids, so without this there would be no reference to observe.
        var episode = (await sut.InsertEpisodeAsync(_fixture.AutoFixture
            .Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, timeline.TimelineId)
            .With(x => x.CategoryIds, new List<Guid> { category.CategoryId })
            .With(x => x.Indefinite, false)
            .Create())).Value;

        var episodesBefore = (await sut.GetAsync(timeline.TimelineId)).Value.Episodes.Count;

        // act
        var result = await sut.DeleteCategoryAsync(timeline.TimelineId, category.CategoryId);

        // assert
        result.IsSuccess.Should().BeTrue();

        var after = (await sut.GetAsync(timeline.TimelineId)).Value;
        after.Categories.Should().NotContain(c => c.CategoryId == category.CategoryId);

        // The episode survives, still carrying the now-dangling category id: removing a
        // category hides episodes from the timeline, it does not delete them.
        after.Episodes.Should().HaveCount(episodesBefore);
        after.Episodes
            .Single(e => e.EpisodeId == episode.EpisodeId)
            .CategoryIds
            .Should()
            .Contain(category.CategoryId);
    }

    [Fact]
    public async Task InsertCategoryAsync_WritesThroughToTheFile()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var inserted = await sut.InsertCategoryAsync(new InsertCategoryRequest
        {
            TimelineId = timeline.TimelineId,
            Title = "Persisted",
            Subtitle = string.Empty,
            Description = string.Empty,
            Confidentiality = Confidentiality.Public,
            SortOrder = 99,
            Icon = "briefcase",
            Color = ""
        });

        // assert - reopening the file is the only check that catches a write which only ever
        // reached the in-memory collection.
        inserted.IsSuccess.Should().BeTrue();

        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Categories.Should()
            .Contain(c => c.CategoryId == inserted.Value.CategoryId);
    }

    [Fact]
    public async Task UpdateCategoryAsync_WritesThroughToTheFile()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var category = timeline.Categories.First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        await sut.UpdateCategoryAsync(new UpdateCategoryRequest
        {
            TimelineId = timeline.TimelineId,
            Category = category with { Title = "Renamed on disk" }
        });

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Categories.Single(c => c.CategoryId == category.CategoryId)
            .Title.Should()
            .Be("Renamed on disk");
    }

    [Fact]
    public async Task DeleteCategoryAsync_WritesThroughToTheFile()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var category = timeline.Categories.Last();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        await sut.DeleteCategoryAsync(timeline.TimelineId, category.CategoryId);

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Categories.Should()
            .NotContain(c => c.CategoryId == category.CategoryId);
    }

    [Theory]
    [InlineData("2005-01-01", "2005-01-01", false, EpisodeType.Incident)]
    [InlineData("2005-01-01", "2005-06-30", false, EpisodeType.Era)]
    [InlineData("2005-01-01", "9999-12-31", true, EpisodeType.Era)]
    public async Task UpdateEpisodeAsync_DerivesEpisodeTypeFromTheDates(
        string start, string end, bool indefinite, EpisodeType expected)
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_fixture.Store);

        // act - deliberately claim the wrong type; the dates decide.
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with
            {
                Start = DateOnly.Parse(start),
                End = DateOnly.Parse(end),
                Indefinite = indefinite,
                EpisodeType = expected == EpisodeType.Era ? EpisodeType.Incident : EpisodeType.Era
            }
        });

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .EpisodeType.Should()
            .Be(expected);
    }

    [Fact]
    public async Task UpdateEpisodeAsync_WritesThroughToTheFile()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { Title = "Edited on disk" }
        });

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .Title.Should()
            .Be("Edited on disk");
    }

    /// <summary>
    /// UpdateEpisodeAsync copies the episode field by field, so a field added to the domain
    /// model and not to that list is silently dropped on every save — which is exactly what
    /// happened to ImageName the first time round: the request answered 204 and the name
    /// never reached the file.
    /// </summary>
    [Fact]
    public async Task UpdateEpisodeAsync_KeepsTheImageName()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { ImageName = "kalamazoo-house.jpg" }
        });

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .ImageName.Should()
            .Be("kalamazoo-house.jpg");
    }

    [Fact]
    public async Task UpdateEpisodeAsync_CanClearTheImageName()
    {
        // arrange — an episode that already has an image, so the empty string has to survive
        // the round trip rather than being read as "unchanged".
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_fixture.Store);

        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { ImageName = "before.jpg" }
        });

        var withImage = (await sut.GetEpisodeAsync(timeline.TimelineId, episode.EpisodeId)).Value;

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = withImage with { ImageName = string.Empty }
        });

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .ImageName.Should()
            .BeEmpty();
    }

    [Fact]
    public async Task InsertEpisodeAsync_KeepsTheImageName()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var category = timeline.Categories.First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var inserted = (await sut.InsertEpisodeAsync(_fixture.AutoFixture
            .Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, timeline.TimelineId)
            .With(x => x.CategoryIds, new List<Guid> { category.CategoryId })
            .With(x => x.Indefinite, false)
            .With(x => x.ImageName, "first-day-at-acme.png")
            .Create())).Value;

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == inserted.EpisodeId)
            .ImageName.Should()
            .Be("first-day-at-acme.png");
    }

    /// <summary>
    /// The same field-by-field copy that dropped ImageName would drop NarrativeName. It is
    /// worth its own test rather than trusting the pattern: unlike an image, whose bytes the
    /// upload endpoint can always be pointed at again, a narrative reference that vanishes
    /// leaves prose the user typed sitting in a file nothing links to.
    /// </summary>
    [Fact]
    public async Task UpdateEpisodeAsync_KeepsTheNarrativeName()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { NarrativeName = "moving-to-kalamazoo.md" }
        });

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .NarrativeName.Should()
            .Be("moving-to-kalamazoo.md");
    }

    [Fact]
    public async Task UpdateEpisodeAsync_CanClearTheNarrativeName()
    {
        // arrange — an episode that already has a narrative, so the empty string has to
        // survive the round trip rather than being read as "unchanged".
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_fixture.Store);

        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { NarrativeName = "before.md" }
        });

        var withNarrative = (await sut.GetEpisodeAsync(timeline.TimelineId, episode.EpisodeId)).Value;

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = withNarrative with { NarrativeName = string.Empty }
        });

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .NarrativeName.Should()
            .BeEmpty();
    }

    [Fact]
    public async Task InsertEpisodeAsync_KeepsTheNarrativeName()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var category = timeline.Categories.First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var inserted = (await sut.InsertEpisodeAsync(_fixture.AutoFixture
            .Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, timeline.TimelineId)
            .With(x => x.CategoryIds, new List<Guid> { category.CategoryId })
            .With(x => x.Indefinite, false)
            .With(x => x.NarrativeName, "first-day-at-acme.md")
            .Create())).Value;

        // assert
        (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == inserted.EpisodeId)
            .NarrativeName.Should()
            .Be("first-day-at-acme.md");
    }

    [Fact]
    public async Task DeleteEpisodeAsync_RemovesTheEpisodeAndWritesThroughToTheFile()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();
        var remaining = timeline.Episodes.Count - 1;
        var categoriesBefore = timeline.Categories.Count;
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.DeleteEpisodeAsync(timeline.TimelineId, episode.EpisodeId);

        // assert
        result.IsSuccess.Should().BeTrue();

        var onDisk = (await _fixture.GetTimelinesFromDiskAsync())
            .Single(t => t.TimelineId == timeline.TimelineId);

        onDisk.Episodes.Should().NotContain(e => e.EpisodeId == episode.EpisodeId);
        onDisk.Episodes.Should().HaveCount(remaining);

        // Deleting an episode must not disturb anything around it.
        onDisk.Categories.Should().HaveCount(categoriesBefore);
    }

    [Fact]
    public async Task DeleteEpisodeAsync_GivenUnknownEpisode_ReturnsNotFound()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.DeleteEpisodeAsync(timeline.TimelineId, Guid.CreateVersion7());

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteCategoryAsync_GivenUnknownCategory_ReturnsNotFound()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.DeleteCategoryAsync(timeline.TimelineId, Guid.CreateVersion7());

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateCategoryAsync_GivenValidRequest_UpdatesCategory()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var category = timeline.Categories.First();
        var updatedCategory = category with
        {
            Title = "Updated Title",
            Subtitle = "Updated Subtitle",
            Confidentiality = Confidentiality.OnlyMe
        };
        var request = new UpdateCategoryRequest
        {
            TimelineId = timeline.TimelineId,
            Category = updatedCategory
        };
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.UpdateCategoryAsync(request);

        // assert
        result.IsSuccess.Should().BeTrue();

        var categories = (await sut.GetCategoriesAsync(timeline.TimelineId)).Value;
        var actual = categories.First(c => c.CategoryId == category.CategoryId);
        actual.Title.Should().Be(updatedCategory.Title);
        actual.Subtitle.Should().Be(updatedCategory.Subtitle);
        actual.Confidentiality.Should().Be(updatedCategory.Confidentiality);
    }

    [Fact]
    public async Task UpdateCategoryAsync_GivenInvalidTimelineId_ReturnsNotFound()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var category = timeline.Categories.First();
        var request = new UpdateCategoryRequest
        {
            TimelineId = Guid.CreateVersion7(),// invalid timeline
            Category = category
        };
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.UpdateCategoryAsync(request);

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateCategoryAsync_GivenInvalidCategoryId_ReturnsNotFound()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var invalidCategory = timeline.Categories.First() with { CategoryId = Guid.CreateVersion7() };
        var request = new UpdateCategoryRequest
        {
            TimelineId = timeline.TimelineId,
            Category = invalidCategory
        };
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.UpdateCategoryAsync(request);

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task InsertEpisodeAsync_GivenValidRequest_InsertsEpisode()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();

        var request = _fixture.AutoFixture.Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, timeline.TimelineId)
            .With(x => x.CategoryIds, timeline.Categories.Select(c => c.CategoryId).ToList())
            .Create();

        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.InsertEpisodeAsync(request);

        // assert
        result.IsSuccess.Should().BeTrue();

        // verify episode is persisted
        var episodes = (await sut.GetAsync(timeline.TimelineId)).Value.Episodes;
        episodes.Should().ContainSingle(e => e.EpisodeId == result.Value.EpisodeId);
    }

    [Fact]
    public async Task InsertEpisodeAsync_GivenInvalidTimelineId_ReturnsNotFound()
    {
        // arrange
        var request = _fixture.AutoFixture.Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, Guid.CreateVersion7)
            .Create();

        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.InsertEpisodeAsync(request);

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateEpisodeAsync_GivenValidRequest_UpdatesEpisode()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();

        var updatedEpisode = episode with
        {
            Title = "Updated Episode Title",
            Subtitle = "Updated Episode Subtitle",
            Description = "Updated Description",
            Url = "https://updated.example.com",
            UrlDescription = "Updated URL",
            Confidentiality = Confidentiality.OnlyMe,
            Start = episode.Start.AddDays(1),
            End = episode.End.AddDays(1),
            StartPrecision = episode.StartPrecision,
            EndPrecision = episode.EndPrecision,
            CategoryIds = timeline.Categories.Select(c => c.CategoryId).ToList()
        };
        var request = new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = updatedEpisode
        };
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.UpdateEpisodeAsync(request);

        // assert
        result.IsSuccess.Should().BeTrue();

        var episodes = (await sut.GetAsync(timeline.TimelineId)).Value.Episodes;
        var actual = episodes.First(e => e.EpisodeId == episode.EpisodeId);
        actual.Title.Should().Be(updatedEpisode.Title);
    }

    [Fact]
    public async Task UpdateEpisodeAsync_GivenInvalidTimelineId_ReturnsNotFound()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var episode = timeline.Episodes.First();
        var request = new UpdateEpisodeRequest
        {
            TimelineId = Guid.CreateVersion7(),
            Episode = episode
        };
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.UpdateEpisodeAsync(request);

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateEpisodeAsync_GivenInvalidEpisodeId_ReturnsNotFound()
    {
        // arrange
        var timeline = (await _fixture.GetTimelinesAsync()).First();
        var invalidEpisode = timeline.Episodes.First() with { EpisodeId = Guid.CreateVersion7() };
        var request = new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = invalidEpisode
        };
        var sut = new TimelineProvider(_fixture.Store);

        // act
        var result = await sut.UpdateEpisodeAsync(request);

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }
}