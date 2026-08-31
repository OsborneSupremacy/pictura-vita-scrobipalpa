using AutoFixture;
using FluentAssertions;
using Pictura.Vita.Data.Integration.Tests.Fixtures;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Domain;
using Pictura.Vita.Messaging;

namespace Pictura.Vita.Data.Integration.Tests;

public class TimelineProviderTests : IClassFixture<DataStoreFixture>
{
    private readonly DataStoreFixture _dataStoreFixture;

    public TimelineProviderTests(DataStoreFixture dataStoreFixture)
    {
        _dataStoreFixture = dataStoreFixture ?? throw new ArgumentNullException(nameof(dataStoreFixture));
    }

    [Fact]
    public async Task GetAllAsync_GivenValidRequest_ReturnsAll()
    {
        // arrange
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var result = (await sut.GetAllAsync()).ToList();

        // assert
        result.Should()
            .NotBeNull()
            .And.BeOfType<List<Timeline>>();
    }

    [Fact]
    public async Task GetTimelineAsync_GivenValidTimelineId_ReturnsTimeline()
    {
        // arrange
        var timelineId = _dataStoreFixture.GetTimelines().First().TimelineId;

        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);
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
        var timelineIn = _dataStoreFixture.GetTimelines().First();

        var updatedTimeline = timelineIn with
        {
            TimelineInfo = _dataStoreFixture
                .AutoFixture
                .Create<TimelineInfo>()
        };

        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var timelineIn = _dataStoreFixture.GetTimelines().First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var result = await sut.UpdateTimelineInfoAsync(new UpdateTimelineInfoRequest
        {
            TimelineId = Guid.CreateVersion7(),
            TimelineInfo = _dataStoreFixture.AutoFixture.Create<TimelineInfo>()
        });

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task GetCategoriesAsync_GivenValidRequest_ReturnsCategories()
    {
        // arrange
        var timelineId = _dataStoreFixture.GetTimelines().First().TimelineId;
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var result = (await sut.GetCategoriesAsync(timelineId)).Value.ToList();

        // assert
        result.Should()
            .NotBeNull()
            .And.BeOfType<List<Category>>();
    }

    [Fact]
    public async Task GetCategoriesAsync_GivenInvalidTimelineId_ReturnsNotFound()
    {
        // arrange
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);
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
        var timeline = _dataStoreFixture.GetTimelines().First();
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
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var category = timeline.Categories.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // Give the category an episode of its own; the fixture's episodes carry unrelated
        // category ids, so without this there would be no reference to observe.
        var episode = (await sut.InsertEpisodeAsync(_dataStoreFixture.AutoFixture
            .Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, timeline.TimelineId)
            .With(x => x.CategoryIds, new List<Guid> { category.CategoryId })
            .With(x => x.Indefinite, false)
            .Create())).Value;

        var episodesBefore = (await sut.GetAsync(timeline.TimelineId)).Value.Episodes.Count;

        // act
        var result = await sut.DeleteCategoryAsync(category.CategoryId);

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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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

        _dataStoreFixture.GetTimelinesFromDisk()
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Categories.Should()
            .Contain(c => c.CategoryId == inserted.Value.CategoryId);
    }

    [Fact]
    public async Task UpdateCategoryAsync_WritesThroughToTheFile()
    {
        // arrange
        var timeline = _dataStoreFixture.GetTimelines().First();
        var category = timeline.Categories.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        await sut.UpdateCategoryAsync(new UpdateCategoryRequest
        {
            TimelineId = timeline.TimelineId,
            Category = category with { Title = "Renamed on disk" }
        });

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Categories.Single(c => c.CategoryId == category.CategoryId)
            .Title.Should()
            .Be("Renamed on disk");
    }

    [Fact]
    public async Task DeleteCategoryAsync_WritesThroughToTheFile()
    {
        // arrange
        var timeline = _dataStoreFixture.GetTimelines().First();
        var category = timeline.Categories.Last();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        await sut.DeleteCategoryAsync(category.CategoryId);

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        _dataStoreFixture.GetTimelinesFromDisk()
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .EpisodeType.Should()
            .Be(expected);
    }

    [Fact]
    public async Task UpdateEpisodeAsync_WritesThroughToTheFile()
    {
        // arrange
        var timeline = _dataStoreFixture.GetTimelines().First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { Title = "Edited on disk" }
        });

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { ImageName = "kalamazoo-house.jpg" }
        });

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { ImageName = "before.jpg" }
        });

        var withImage = (await sut.GetEpisodeAsync(episode.EpisodeId)).Value;

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = withImage with { ImageName = string.Empty }
        });

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .ImageName.Should()
            .BeEmpty();
    }

    [Fact]
    public async Task InsertEpisodeAsync_KeepsTheImageName()
    {
        // arrange
        var timeline = _dataStoreFixture.GetTimelines().First();
        var category = timeline.Categories.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var inserted = (await sut.InsertEpisodeAsync(_dataStoreFixture.AutoFixture
            .Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, timeline.TimelineId)
            .With(x => x.CategoryIds, new List<Guid> { category.CategoryId })
            .With(x => x.Indefinite, false)
            .With(x => x.ImageName, "first-day-at-acme.png")
            .Create())).Value;

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { NarrativeName = "moving-to-kalamazoo.md" }
        });

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var episode = timeline.Episodes.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = episode with { NarrativeName = "before.md" }
        });

        var withNarrative = (await sut.GetEpisodeAsync(episode.EpisodeId)).Value;

        // act
        await sut.UpdateEpisodeAsync(new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = withNarrative with { NarrativeName = string.Empty }
        });

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == episode.EpisodeId)
            .NarrativeName.Should()
            .BeEmpty();
    }

    [Fact]
    public async Task InsertEpisodeAsync_KeepsTheNarrativeName()
    {
        // arrange
        var timeline = _dataStoreFixture.GetTimelines().First();
        var category = timeline.Categories.First();
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var inserted = (await sut.InsertEpisodeAsync(_dataStoreFixture.AutoFixture
            .Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, timeline.TimelineId)
            .With(x => x.CategoryIds, new List<Guid> { category.CategoryId })
            .With(x => x.Indefinite, false)
            .With(x => x.NarrativeName, "first-day-at-acme.md")
            .Create())).Value;

        // assert
        _dataStoreFixture.GetTimelinesFromDisk()
            .Single(t => t.TimelineId == timeline.TimelineId)
            .Episodes.Single(e => e.EpisodeId == inserted.EpisodeId)
            .NarrativeName.Should()
            .Be("first-day-at-acme.md");
    }

    [Fact]
    public async Task DeleteEpisodeAsync_RemovesTheEpisodeAndWritesThroughToTheFile()
    {
        // arrange
        var timeline = _dataStoreFixture.GetTimelines().First();
        var episode = timeline.Episodes.First();
        var remaining = timeline.Episodes.Count - 1;
        var categoriesBefore = timeline.Categories.Count;
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var result = await sut.DeleteEpisodeAsync(episode.EpisodeId);

        // assert
        result.IsSuccess.Should().BeTrue();

        var onDisk = _dataStoreFixture.GetTimelinesFromDisk()
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
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var result = await sut.DeleteEpisodeAsync(Guid.CreateVersion7());

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteCategoryAsync_GivenUnknownCategory_ReturnsNotFound()
    {
        // arrange
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var result = await sut.DeleteCategoryAsync(Guid.CreateVersion7());

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }

    [Fact]
    public async Task UpdateCategoryAsync_GivenValidRequest_UpdatesCategory()
    {
        // arrange
        var timeline = _dataStoreFixture.GetTimelines().First();
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
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var category = timeline.Categories.First();
        var request = new UpdateCategoryRequest
        {
            TimelineId = Guid.CreateVersion7(),// invalid timeline
            Category = category
        };
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var invalidCategory = timeline.Categories.First() with { CategoryId = Guid.CreateVersion7() };
        var request = new UpdateCategoryRequest
        {
            TimelineId = timeline.TimelineId,
            Category = invalidCategory
        };
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var timeline = _dataStoreFixture.GetTimelines().First();

        var request = _dataStoreFixture.AutoFixture.Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, timeline.TimelineId)
            .With(x => x.CategoryIds, timeline.Categories.Select(c => c.CategoryId).ToList())
            .Create();

        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var request = _dataStoreFixture.AutoFixture.Build<InsertEpisodeRequest>()
            .With(x => x.TimelineId, Guid.CreateVersion7)
            .Create();

        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var timeline = _dataStoreFixture.GetTimelines().First();
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
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var episode = timeline.Episodes.First();
        var request = new UpdateEpisodeRequest
        {
            TimelineId = Guid.CreateVersion7(),
            Episode = episode
        };
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

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
        var timeline = _dataStoreFixture.GetTimelines().First();
        var invalidEpisode = timeline.Episodes.First() with { EpisodeId = Guid.CreateVersion7() };
        var request = new UpdateEpisodeRequest
        {
            TimelineId = timeline.TimelineId,
            Episode = invalidEpisode
        };
        var sut = new TimelineProvider(_dataStoreFixture.DataStore);

        // act
        var result = await sut.UpdateEpisodeAsync(request);

        // assert
        result.IsSuccess.Should().BeFalse();
        result.Exception.Should().BeOfType<KeyNotFoundException>();
    }
}