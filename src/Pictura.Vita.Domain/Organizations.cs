namespace Pictura.Vita.Domain;

public static class Organizations
{
    public static readonly Organization Empty = new()
    {
        Name = string.Empty,
        ObfuscateDates = false,
        StartPrecision = DatePrecision.Day,
        Start = DateOnly.MinValue,
        EndPrecision = DatePrecision.Day,
        End = DateOnly.MaxValue
    };
}