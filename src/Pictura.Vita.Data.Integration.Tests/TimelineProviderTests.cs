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
        var invalidId = Guid.NewGuid();

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
        await sut.UpdateTimelineInfoAsync(updatedTimeline);

        var timelineOut = (await sut.GetAsync(timelineIn.TimelineId)).Value;

        // assert
        timelineOut.Should().BeEquivalentTo(updatedTimeline);
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
        var invalidId = Guid.NewGuid();

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
            Subtitle = "Test Subtitle"
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
            TimelineId = Guid.NewGuid(),// invalid timeline
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
        var invalidCategory = timeline.Categories.First() with { CategoryId = Guid.NewGuid() };
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
            .With(x => x.TimelineId, Guid.NewGuid())
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
            TimelineId = Guid.NewGuid(),
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
        var invalidEpisode = timeline.Episodes.First() with { EpisodeId = Guid.NewGuid() };
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