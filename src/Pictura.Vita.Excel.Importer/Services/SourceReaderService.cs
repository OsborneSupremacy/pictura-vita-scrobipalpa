using ClosedXML.Excel;
using Pictura.Vita.Excel.Importer.Models;

namespace Pictura.Vita.Excel.Importer.Services;

internal static class SourceReaderService
{
    private const int Headline = 1;
    private const int Description1 = 2;
    private const int Description2 = 3;
    private const int Url = 4;
    private const int UrlDescription = 5;
    private const int StartDate = 6;
    private const int EndDate = 7;
    private const int Group = 8;
    private const int ImageName = 9;

    public static IReadOnlyList<Occurrence> ReadAll(string sourcePath)
    {
        using var workbook = new XLWorkbook(sourcePath);

        // Previously Worksheets.Single(), which threw an unexplained exception the moment the
        // workbook gained a second sheet.
        var worksheet = workbook.Worksheets.FirstOrDefault()
            ?? throw new InvalidOperationException($"'{sourcePath}' contains no worksheets.");

        return worksheet.RowsUsed()
            .Skip(1) // header
            .Select(row => new Occurrence
            {
                RowNumber = row.RowNumber(),
                Headline = row.Cell(Headline).GetString().Trim(),
                Description1 = row.Cell(Description1).GetString().Trim(),
                Description2 = row.Cell(Description2).GetString().Trim(),
                Url = row.Cell(Url).GetString().Trim(),
                UrlDescription = row.Cell(UrlDescription).GetString().Trim(),
                StartDate = ReadDate(row.Cell(StartDate)) ?? DateOnly.MinValue,
                // A blank end date means the occurrence is still going.
                EndDate = ReadDate(row.Cell(EndDate)) ?? DateOnly.MaxValue,
                Group = row.Cell(Group).GetString().Trim(),
                ImageName = row.Cell(ImageName).GetString().Trim()
            })
            .OrderBy(occurrence => occurrence.StartDate)
            .ThenBy(occurrence => occurrence.Group)
            .ToList();
    }

    /// <summary>
    /// Reads a date cell, returning null when it is blank or not a date. The previous
    /// implementation called GetDateTime() directly, which threw on a text cell and gave no
    /// indication of which row was at fault.
    /// </summary>
    private static DateOnly? ReadDate(IXLCell cell)
    {
        if (cell.IsEmpty()) return null;

        if (cell.DataType == XLDataType.DateTime && cell.Value.IsDateTime)
            return DateOnly.FromDateTime(cell.Value.GetDateTime());

        return DateOnly.TryParse(cell.GetString(), out var parsed) ? parsed : null;
    }
}
