namespace Pictura.Vita.Domain;

public static class Persons
{
    public static Person Empty => new()
    {
        NameParts = [],
        ObfuscateDates = false,
        BirthPrecision = DatePrecision.Day,
        Birth = DateOnly.MinValue,
        DeathPrecision = DatePrecision.Day,
        Death = DateOnly.MaxValue
    };
}