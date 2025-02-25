namespace Pictura.Vita.Domain;

public record Person
{
    public required IList<string> NameParts { get; init; }

    public required bool ObfuscateDates { get; init; }

    public required DatePrecision BirthPrecision { get; init; }

    public required DateOnly Birth { get; init; }

    public required DatePrecision DeathPrecision { get; init; }

    public required DateOnly Death { get; init; }
}