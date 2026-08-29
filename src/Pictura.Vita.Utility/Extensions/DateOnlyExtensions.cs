namespace Pictura.Vita.Utility.Extensions;

public static class DateOnlyExtensions
{
    extension(DateOnly date)
    {
        public DateTime ToDateTime() =>
            date.ToDateTime(TimeOnly.MinValue);

        /// <summary>
        /// The signed number of days from <paramref name="other"/> to <paramref name="date"/>.
        /// Negative when <paramref name="date"/> falls earlier than <paramref name="other"/>,
        /// so that inverted ranges surface rather than being silently absolved.
        /// </summary>
        public int DayCount(DateOnly other) =>
            date.DayNumber - other.DayNumber;
    }
}
