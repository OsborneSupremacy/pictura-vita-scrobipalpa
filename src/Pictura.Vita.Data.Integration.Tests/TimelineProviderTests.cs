using FluentAssertions;
using Pictura.Vita.Data.Integration.Tests.Fixtures;
using Pictura.Vita.Data.Providers;
using Pictura.Vita.Domain;

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
}