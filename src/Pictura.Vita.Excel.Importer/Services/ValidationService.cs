using Pictura.Vita.Excel.Importer.Models;

namespace Pictura.Vita.Excel.Importer.Services;

internal record RowProblem(int RowNumber, string Problem);

/// <summary>
/// Checks the spreadsheet before anything is written.
///
/// The importer previously passed every row straight through, so a transposed year or a
/// blank date became a silently malformed episode that only showed up as a strange-looking
/// timeline much later.
/// </summary>
internal static class ValidationService
{
    public static IReadOnlyList<RowProblem> Validate(IReadOnlyList<Occurrence> occurrences)
    {
        var problems = new List<RowProblem>();

        foreach (var occurrence in occurrences)
        {
            if (string.IsNullOrWhiteSpace(occurrence.Headline))
                problems.Add(new RowProblem(occurrence.RowNumber, "Headline is blank."));

            if (string.IsNullOrWhiteSpace(occurrence.Group))
                problems.Add(new RowProblem(occurrence.RowNumber, "Group (category) is blank."));

            if (occurrence.StartDate == DateOnly.MinValue)
                problems.Add(new RowProblem(occurrence.RowNumber, "Start date is blank or unreadable."));

            if (!occurrence.Indefinite && occurrence.EndDate < occurrence.StartDate)
                problems.Add(new RowProblem(
                    occurrence.RowNumber,
                    $"End date {occurrence.EndDate:yyyy-MM-dd} is before start date {occurrence.StartDate:yyyy-MM-dd}."));
        }

        foreach (var duplicate in occurrences
                     .GroupBy(occurrence => occurrence.NaturalKey)
                     .Where(group => group.Count() > 1))
        {
            var rows = string.Join(", ", duplicate.Select(occurrence => occurrence.RowNumber));
            problems.Add(new RowProblem(
                duplicate.First().RowNumber,
                $"Duplicate of the same headline, group and dates (rows {rows}); they cannot be told apart."));
        }

        return problems.OrderBy(problem => problem.RowNumber).ToList();
    }

    public static bool IsValid(Occurrence occurrence, IReadOnlyList<RowProblem> problems) =>
        problems.All(problem => problem.RowNumber != occurrence.RowNumber);
}
