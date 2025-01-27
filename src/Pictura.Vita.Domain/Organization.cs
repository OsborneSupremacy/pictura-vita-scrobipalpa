namespace Pictura.Vita.Domain;

public record Organization
{
    public required string Name { get; init; }

    public required bool ObfuscateDates { get; init; }

    public required DatePrecision StartPrecision { get; init; }

    public required DateOnly Start { get; init; }

    public required DatePrecision EndPrecision { get; init; }

    public required DateOnly End { get; init; }
}

