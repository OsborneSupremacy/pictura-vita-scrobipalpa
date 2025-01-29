namespace Pictura.Vita.Domain;

public static class Persons
{
    public static Person Empty => new()
    {
        NameParts = [],
        ObfuscateDates = false,
        BirthPrecision = DatePrecision.Exact,
        Birth = DateOnly.MinValue,
        DeathPrecision = DatePrecision.Exact,
        Death = DateOnly.MaxValue
    };
}