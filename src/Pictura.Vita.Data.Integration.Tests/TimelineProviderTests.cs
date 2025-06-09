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





}