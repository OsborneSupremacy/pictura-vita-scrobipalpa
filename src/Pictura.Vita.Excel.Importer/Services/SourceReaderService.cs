using ClosedXML.Excel;
using Pictura.Vita.Excel.Importer.Models;

namespace Pictura.Vita.Excel.Importer.Services;

internal static class SourceReaderService
{
    public static Dictionary<Guid, Occurrence> ReadAll(string sourcePath)
    {
        using var workbook = new XLWorkbook(sourcePath);

        var worksheet = workbook.Worksheets.Single();

        var items = worksheet.RowsUsed()
            .Skip(1) // Skip header row
            .Select(row => new Occurrence
            {
                Headline = row.Cell(1).GetString(),
                Description1 = row.Cell(2).GetString(),
                Description2 = row.Cell(3).GetString(),
                Url = row.Cell(4).GetString(),
                UrlDescription = row.Cell(5).GetString(),
                StartDate = DateOnly.FromDateTime(row.Cell(6).GetDateTime()),
                EndDate = string.IsNullOrEmpty(row.Cell(7).GetString()) ? DateOnly.MaxValue : DateOnly.FromDateTime(row.Cell(7).GetDateTime()),
                Group = row.Cell(8).GetString(),
            });

        return items
            .OrderBy(x => x.StartDate)
            .ThenBy(x => x.Group)
            .ToDictionary(_ => Guid.CreateVersion7());
    }
}