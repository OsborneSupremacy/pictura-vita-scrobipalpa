namespace Pictura.Vita.Utility;

/// <summary>
/// Decides whether a stored image name is safe to resolve against a directory.
///
/// The name arrives from the timeline file, and a timeline file is an input — it is written
/// by the Excel importer, hand-edited, and copied between machines. Joining an unchecked
/// name to a root would let "../../.ssh/id_rsa" out of the sandbox, and the API is an HTTP
/// server on loopback that any page open in the browser can reach.
///
/// This lives here rather than in the API so the write path (validators) and the read path
/// (the image store) cannot disagree about what a legal name is.
/// </summary>
public static class ImageFileName
{
    /// <summary>
    /// Extensions the application will serve. HEIC is deliberately absent: SkiaSharp cannot
    /// decode it, so accepting the name would promise a thumbnail that never appears. Photos
    /// straight off an iPhone have to be converted first.
    /// </summary>
    public static readonly IReadOnlySet<string> AllowedExtensions =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp", ".gif" };

    /// <summary>
    /// True when <paramref name="name"/> is a bare file name with a supported extension.
    /// Empty is not safe — it is "no image", which callers must handle before asking.
    /// </summary>
    public static bool IsValid(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return false;

        // Rejects separators, "..", rooted paths, and volume prefixes in one comparison:
        // GetFileName returns something different from its input for every one of them.
        if (!string.Equals(Path.GetFileName(name), name, StringComparison.Ordinal)) return false;

        // GetFileName leaves these alone on the wrong platform — "a\b.jpg" is a legal file
        // name on macOS but a path on Windows, and the data file travels between them.
        if (name.Contains('/') || name.Contains('\\')) return false;

        if (name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return false;

        return AllowedExtensions.Contains(Path.GetExtension(name));
    }

    /// <summary>
    /// The absolute path <paramref name="name"/> resolves to inside <paramref name="root"/>,
    /// or null when it is not a legal name or escapes the root.
    ///
    /// The containment check is repeated after resolution rather than trusted from
    /// <see cref="IsValid"/> alone: symlinks and case-insensitive volumes make the textual
    /// check a necessary condition, not a sufficient one.
    /// </summary>
    public static string? ResolveWithin(string root, string? name)
    {
        if (!IsValid(name)) return null;

        var rootFull = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        var candidate = Path.GetFullPath(Path.Combine(rootFull, name!));

        var prefix = rootFull + Path.DirectorySeparatorChar;

        return candidate.StartsWith(prefix, StringComparison.Ordinal) ? candidate : null;
    }
}
