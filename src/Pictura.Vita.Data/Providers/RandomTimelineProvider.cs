using AutoBogus;
using Bogus;
using Person = Pictura.Vita.Domain.Person;

namespace Pictura.Vita.Data.Providers;

public class RandomTimelineProvider
{
    private readonly Faker _faker;

    private readonly Randomizer _randomizer;

    private readonly List<string> _standardCategoryNames =
    [
        "Family",
        "Friends",
        "Work",
        "Education",
        "Travel",
        "Hobbies",
        "Health",
        "Finance",
        "Achievements",
        "Miscellaneous"
    ];

    public RandomTimelineProvider()
    {
        _faker = new Faker();
        _randomizer = new Randomizer();
    }

    public Timeline Generate()
    {
        var person = GeneratePerson();

        var categories = _standardCategoryNames
            .Select((name, index) => new Category
            {
                CategoryId = Guid.CreateVersion7(),
                Title = name,
                Subtitle = _faker.Lorem.Sentence(3),
                Confidentiality = _randomizer.Enum<Confidentiality>(),
                SortOrder = index
            })
            .ToList();

        var generateEpisodesRequest = new GenerateEpisodesRequest
        {
            Count = _randomizer.Int(30, 50),
            Min = person.Birth,
            Max = person.Death,
            Categories = categories
        };

        return new Timeline
        {
            TimelineId = Guid.CreateVersion7(),
            TimelineInfo = GenerateTimelineInfo(person),
            Episodes = GenerateEpisodes(generateEpisodesRequest).OrderBy(e => e.Start).ToList(),
            Categories = categories
        };
    }

    private Person GeneratePerson()
    {
        AutoFaker<Person> personFaker = new();

        personFaker
            .RuleFor(p => p.NameParts, _ => PersonNamePartRandomizer())
            .RuleFor(p => p.ObfuscateDates, _ => _randomizer.Bool())
            .RuleFor(p => p.BirthPrecision, DatePrecision.Day)
            .RuleFor(p => p.Birth, _ => DateOnly.FromDateTime(_faker.Date.Past(100)))
            .RuleFor(p => p.DeathPrecision, DatePrecision.Day)
            .RuleFor(p => p.Death, DateOnly.MaxValue)
            .RuleFor(p => p.Living, true);

        return personFaker.Generate();
    }

    private TimelineInfo GenerateTimelineInfo(Person person)
    {
        AutoFaker<TimelineInfo> timelineInfoFaker = new();

        timelineInfoFaker
            .RuleFor(ti => ti.Title, $"{person.GetFullNamePossessive()} Timeline")
            .RuleFor(ti => ti.TimelineSubject, new TimelineSubject
            {
                SubjectType = SubjectType.Person,
                Organization = Organizations.Empty,
                Person = person
            })
            .RuleFor(ti => ti.Start, person.Birth)
            .RuleFor(ti => ti.End, person.Death);

        return timelineInfoFaker.Generate();
    }

    private record GenerateEpisodesRequest
    {
        public required int Count { get; init; }

        public required DateOnly Min { get; init; }

        public required DateOnly Max { get; init; }

        public required List<Category> Categories { get; init; }
    }

    private IEnumerable<Episode> GenerateEpisodes(GenerateEpisodesRequest request)
    {
        AutoFaker<Episode> episodeFaker = new();

        episodeFaker
            .RuleFor(e => e.EpisodeId, _ => Guid.CreateVersion7())
            .RuleFor(e => e.Confidentiality, _ => _randomizer.Enum<Confidentiality>())
            .RuleFor(e => e.Title, f => f.Lorem.Sentence(3))
            .RuleFor(e => e.Subtitle, f => f.Lorem.Sentence(5))
            .RuleFor(e => e.Description, f => f.Lorem.Paragraph(2))
            .RuleFor(e => e.Url, f => f.Internet.Url())
            .RuleFor(e => e.UrlDescription, f => f.Lorem.Sentence(4))
            .RuleFor(e => e.EpisodeType, EpisodeType.Incident)
            .RuleFor(e => e.StartPrecision, DatePrecision.Day)
            .RuleFor(e => e.EndPrecision, DatePrecision.Day)
            .RuleFor(e => e.Start, f => f.Date.BetweenDateOnly(request.Min, request.Max))
            .RuleFor(e => e.End, f => f.Date.BetweenDateOnly(request.Min, request.Max))
            .RuleFor(e => e.Indefinite, false)
            .RuleFor(e => e.CategoryIds, f => [f.PickRandom(request.Categories).CategoryId])
            ;

        var episodeCount = 0;

        while (episodeCount < request.Count)
        {
            var episode = episodeFaker.Generate();

            var start = _faker.Date.BetweenDateOnly(request.Min, DateTime.Today.ToDateOnly());
            var episodeType = _randomizer.Enum<EpisodeType>();
            var indefinite = episodeType == EpisodeType.Era && _randomizer.Bool(0.15f);
            var end = episodeType == EpisodeType.Incident ? start : start.AddMonths(_randomizer.Int(1, 120));

            if(end > request.Max)
                end = request.Max;

            if(indefinite)
                end = DateOnly.MaxValue;

            yield return episode with
            {
                EpisodeType = episodeType,
                Start = start,
                End = end,
                Indefinite = indefinite
            };
            episodeCount++;
        }
    }

    private List<string> PersonNamePartRandomizer() =>
    [
        _faker.Name.FirstName(),
        _faker.Name.LastName()
    ];
}