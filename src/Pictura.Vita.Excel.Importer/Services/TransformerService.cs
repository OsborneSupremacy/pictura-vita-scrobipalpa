using Pictura.Vita.Domain;
using Pictura.Vita.Excel.Importer.Models;
using Pictura.Vita.Utility;

namespace Pictura.Vita.Excel.Importer.Services;

internal static class TransformerService
{
    /// <summary>
    /// Builds a timeline from spreadsheet rows.
    ///
    /// Every identifier is derived from stable content rather than minted fresh, so
    /// re-importing the same workbook produces the same timeline, the same categories and
    /// the same episodes instead of a second copy of everything.
    /// </summary>
    public static Timeline Transform(
        IReadOnlyList<Occurrence> occurrences,
        string sourcePath,
        DateOnly today)
    {
        var timelineId = DeterministicGuid.Create(
            DeterministicGuid.ImportNamespace,
            $"timeline|{Path.GetFullPath(sourcePath)}");

        var username = Environment.UserName;

        var categories = occurrences
            .Select(occurrence => occurrence.Group)
            .Distinct()
            .Order()
            .Select((group, index) => new Category
            {
                CategoryId = DeterministicGuid.Create(
                    DeterministicGuid.ImportNamespace,
                    $"category|{timelineId}|{group}"),
                Title = group,
                Subtitle = string.Empty,
                // The spreadsheet has no column for it either; it is written in the app.
                Description = string.Empty,
                Confidentiality = Confidentiality.OnlyMe,
                SortOrder = index,
                // The spreadsheet carries neither; both are chosen in the app.
                Icon = string.Empty,
                Color = string.Empty
            })
            .ToList();

        var categoryIdsByGroup = categories.ToDictionary(
            category => category.Title,
            category => (IList<Guid>)[category.CategoryId]);

        var episodes = occurrences
            .Select(occurrence => new Episode
            {
                EpisodeId = DeterministicGuid.Create(
                    DeterministicGuid.ImportNamespace,
                    $"episode|{timelineId}|{occurrence.NaturalKey}"),
                Title = occurrence.Headline,
                Subtitle = occurrence.Description1,
                Description = occurrence.Description2,
                Url = occurrence.Url,
                UrlDescription = occurrence.UrlDescription,
                // An unusable name is stored as "no image" rather than passed through: the
                // store should never hold a name the API would refuse to serve. The row is
                // reported as a warning, not dropped — losing a life event over a misspelled
                // .jpg would be a poor trade.
                ImageName = ImageFileName.IsValid(occurrence.ImageName)
                    ? occurrence.ImageName
                    : string.Empty,
                // Always empty: the workbook has no narrative column and never will. The
                // spreadsheet is history (see docs/data-store.md), so re-running the importer
                // against a live data file would blank every narrative reference along with
                // everything else it has no column for.
                NarrativeName = string.Empty,
                EpisodeType = !occurrence.Indefinite && occurrence.StartDate == occurrence.EndDate
                    ? EpisodeType.Incident
                    : EpisodeType.Era,
                Start = occurrence.StartDate,
                StartPrecision = DatePrecision.Day,
                EndPrecision = DatePrecision.Day,
                End = occurrence.EndDate,
                Indefinite = occurrence.Indefinite,
                Confidentiality = Confidentiality.OnlyMe,
                CategoryIds = categoryIdsByGroup[occurrence.Group]
            })
            .ToList();

        var start = episodes.Count == 0 ? today : episodes.Min(episode => episode.Start);

        // The window's end comes from the data: the latest real end, pulled out to today if
        // anything is still running. Previously this was hard-coded to DateOnly.MaxValue,
        // which put the 9999-12-31 sentinel into the timeline's own declared bounds.
        // A timeline with anything still running has no fixed end: record that it is ongoing
        // rather than freezing today's date into the file, which would be wrong tomorrow.
        var ongoing = episodes.Any(episode => episode.Indefinite);

        var latestEnd = episodes
            .Where(episode => !episode.Indefinite)
            .Select(episode => episode.End)
            .DefaultIfEmpty(today)
            .Max();

        var end = ongoing ? DateOnly.MaxValue : latestEnd;
        if (!ongoing && end < start) end = start;

        return new Timeline
        {
            TimelineId = timelineId,
            TimelineInfo = new TimelineInfo
            {
                Title = $"{username}'s Timeline",
                Subtitle = $"Imported from {Path.GetFileName(sourcePath)}",
                TimelineSubject = new TimelineSubject
                {
                    SubjectType = SubjectType.Person,
                    Organization = Organizations.Empty,
                    Person = new Person
                    {
                        NameParts = [username],
                        ObfuscateDates = false,
                        BirthPrecision = DatePrecision.Day,
                        // The spreadsheet carries no birth date. This used to be set to the
                        // earliest episode's start, which invented a birth date that was
                        // simply the first thing the person happened to record.
                        Birth = DateOnly.MinValue,
                        DeathPrecision = DatePrecision.Day,
                        // The spreadsheet says nothing about a death date either.
                        Death = DateOnly.MaxValue,
                        Living = true
                    }
                },
                Start = start,
                End = end,
                Ongoing = ongoing
            },
            Episodes = episodes,
            Categories = categories
        };
    }
}
