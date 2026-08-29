namespace Pictura.Vita.Domain;

public record Organization
{
    public required string Name { get; init; }

    public required bool ObfuscateDates { get; init; }

    public required DatePrecision StartPrecision { get; init; }

    public required DateOnly Start { get; init; }

    public required DatePrecision EndPrecision { get; init; }

    /// <summary>
    /// When <see cref="Ongoing"/> is true this is <see cref="DateOnly.MaxValue"/> and
    /// carries no meaning beyond "no end date".
    /// </summary>
    public required DateOnly End { get; init; }

    /// <summary>
    /// True when the organization still exists, so the timeline has no fixed end.
    /// Mirrors <see cref="Episode.Indefinite"/>.
    /// </summary>
    public required bool Ongoing { get; init; }
}

