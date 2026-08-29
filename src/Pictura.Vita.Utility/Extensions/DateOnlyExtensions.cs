namespace Pictura.Vita.Utility.Extensions;

public static class DateOnlyExtensions
{
    public static DateTime ToDateTime(this DateOnly date) =>
        date.ToDateTime(TimeOnly.MinValue);

    /// <summary>
    /// The signed number of days from <paramref name="other"/> to <paramref name="input"/>.
    /// Negative when <paramref name="input"/> falls earlier than <paramref name="other"/>,
    /// so that inverted ranges surface rather than being silently absolved.
    /// </summary>
    public static int DayCount(this DateOnly input, DateOnly other) =>
        input.DayNumber - other.DayNumber;
}
