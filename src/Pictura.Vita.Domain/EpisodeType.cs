namespace Pictura.Vita.Domain;

public enum EpisodeType
{
    /// <summary>
    /// Duration is one day: the episode starts and ends on the same date.
    /// Drawn as a fixed-width callout rather than a proportional bar.
    /// </summary>
    Incident,
    /// <summary>
    /// Duration is more than one day, or the episode is indefinite.
    /// Drawn as a bar whose width is proportional to its duration.
    /// </summary>
    Era
}
