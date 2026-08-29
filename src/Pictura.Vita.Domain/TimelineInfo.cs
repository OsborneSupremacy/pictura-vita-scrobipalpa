namespace Pictura.Vita.Domain;

public record TimelineInfo
{
    public required string Title { get; init; }

    public required string Subtitle { get; init; }

    public required TimelineSubject TimelineSubject { get; init; }

    /// <summary>The first date the timeline covers.</summary>
    public required DateOnly Start { get; init; }

    /// <summary>
    /// The last date the timeline covers. When <see cref="Ongoing"/> is true this is
    /// <see cref="DateOnly.MaxValue"/> and the timeline runs to the current date instead.
    /// </summary>
    public required DateOnly End { get; init; }

    /// <summary>
    /// True when the timeline has no fixed end and should run to today. Storing this rather
    /// than a concrete end date keeps a living timeline from going stale the day after it is
    /// written. Mirrors <see cref="Episode.Indefinite"/>.
    /// </summary>
    public required bool Ongoing { get; init; }
}