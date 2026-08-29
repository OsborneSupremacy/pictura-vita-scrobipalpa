namespace Pictura.Vita.Domain;

public record Person
{
    public required IList<string> NameParts { get; init; }

    public required bool ObfuscateDates { get; init; }

    public required DatePrecision BirthPrecision { get; init; }

    public required DateOnly Birth { get; init; }

    public required DatePrecision DeathPrecision { get; init; }

    /// <summary>
    /// The date of death. When <see cref="Living"/> is true this is
    /// <see cref="DateOnly.MaxValue"/> and carries no meaning beyond "no death date".
    /// </summary>
    public required DateOnly Death { get; init; }

    /// <summary>
    /// True when the person is still living, so the timeline has no fixed end.
    /// Mirrors <see cref="Episode.Indefinite"/>.
    /// </summary>
    public required bool Living { get; init; }
}