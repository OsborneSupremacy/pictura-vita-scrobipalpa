using Pictura.Vita.Utility.Extensions;

namespace Pictura.Vita.Domain.Extensions;

public static class EpisodeExtensions
{
    public static int Duration(this Episode input) =>
        input.End.Difference(input.Start).Days;
}