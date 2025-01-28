using Pictura.Vita.Domain;
using Pictura.Vita.Excel.Importer.Models;
using Pictura.Vita.Utility.Extensions;

namespace Pictura.Vita.Excel.Importer.Services;

internal static class TransformerService
{
    public static Timeline Transform(Dictionary<Guid, Occurrence> occurrences)
    {
        var startDate = occurrences.Min(x => x.Value.StartDate);

        var username = Environment.UserName;

        var categories = occurrences.Values
            .Select(o => o.Group)
            .Distinct()
            .Select(g => new Category
            {
                CategoryId = Guid.CreateVersion7(),
                Title = g,
                Subtitle = string.Empty,
                Confidentiality = Confidentiality.OnlyMe
            })
            .ToList();

        var episodes = occurrences
            .Select(o => new Episode
            {
                EpisodeId = o.Key,
                Title = o.Value.Headline,
                Subtitle = o.Value.Description1,
                Description = o.Value.Description2,
                Url = o.Value.Url,
                UrlDescription = o.Value.UrlDescription,
                EpisodeType = o.Value.StartDate.Equals(o.Value.EndDate) ? EpisodeType.Incident : EpisodeType.Era,
                Start = o.Value.StartDate,
                StartPrecision = DatePrecision.Exact,
                EndPrecision = DatePrecision.Exact,
                End = o.Value.EndDate,
                Duration = o.Value.EndDate.Difference(o.Value.StartDate).Days,
                Confidentiality = Confidentiality.OnlyMe,
                CategoryIds = categories
                    .Where(c => c.Title == o.Value.Group)
                    .Select(c => c.CategoryId)
                    .ToList()
            })
            .ToList();

        var timeLine = new Timeline
        {
            TimelineId = Guid.CreateVersion7(),
            Title = $"{username}'s Timeline",
            Subtitle = $"Imported on {DateTime.Now}",
            TimelineSubject = new TimelineSubject
            {
                SubjectType = SubjectType.Person,
                Organization = Organizations.Empty,
                Person = new Person
                {
                    Birth = startDate,
                    Death = DateOnly.MaxValue,
                    NameParts = [ username ],
                    TitleParts = [],
                    BirthPrecision = DatePrecision.Exact,
                    DeathPrecision = DatePrecision.Exact,
                    ObfuscateDates = false
                }
            },
            Start = startDate,
            End = DateOnly.MaxValue,
            Episodes = episodes,
            Categories = categories
        };

        return timeLine;
    }
}