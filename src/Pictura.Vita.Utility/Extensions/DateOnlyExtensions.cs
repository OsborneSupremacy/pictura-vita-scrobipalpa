namespace Pictura.Vita.Utility.Extensions;

public static class DateOnlyExtensions
{
    public static DateTime ToDateTime(this DateOnly date) =>
        date.ToDateTime(TimeOnly.MinValue);

    public static TimeSpan Difference(this DateOnly input, DateOnly other) =>
        (input.ToDateTime() - other.ToDateTime()).Duration();
}