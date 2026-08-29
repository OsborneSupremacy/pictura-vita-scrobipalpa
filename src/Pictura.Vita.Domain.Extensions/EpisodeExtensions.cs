using Pictura.Vita.Utility.Extensions;

namespace Pictura.Vita.Domain.Extensions;

public static class EpisodeExtensions
{
    extension(Episode input)
    {
        /// <summary>
        /// The episode's length in whole days, counted inclusively: an episode that starts and
        /// ends on the same day lasts one day. Measured to <paramref name="asOf"/> when the
        /// episode is indefinite. Never negative.
        /// </summary>
        public int Duration(DateOnly asOf) =>
            Math.Max(0, (input.Indefinite ? asOf : input.End).DayCount(input.Start) + 1);

        /// <summary>
        /// The episode's length in whole days as of today. Prefer the <see cref="Duration(Episode, DateOnly)"/>
        /// overload where the result needs to be deterministic.
        /// </summary>
        public int Duration() =>
            input.Duration(DateOnly.FromDateTime(DateTime.Today));
    }
}
