namespace Pictura.Vita.Domain;

public static class Organizations
{
    public static readonly Organization Empty = new()
    {
        Name = string.Empty,
        ObfuscateDates = false,
        StartPrecision = DatePrecision.Exact,
        Start = DateOnly.MinValue,
        EndPrecision = DatePrecision.Exact,
        End = DateOnly.MaxValue
    };
}