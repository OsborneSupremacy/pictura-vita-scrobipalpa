using System.Globalization;
using System.Security.Cryptography;
using System.Text;

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
    /// A file name for freshly uploaded content: a slug of <paramref name="preferredStem"/>
    /// followed by a short digest of the bytes, for example "cornerstone-church-a3f19d.webp".
    ///
    /// The name is generated rather than taken from the upload, because a name supplied by a
    /// client is the same untrusted input <see cref="IsValid"/> exists to defend against —
    /// and on the write path an escape overwrites rather than merely discloses.
    ///
    /// The slug keeps the directory readable to whoever opens it in Finder, which is the
    /// point of storing images as loose files at all. The digest makes the name a function of
    /// the content: uploading the same picture twice lands on the same name instead of
    /// accumulating copies, and two different pictures with the same title cannot collide.
    /// </summary>
    public static string Suggest(string? preferredStem, string extension, ReadOnlySpan<byte> content)
    {
        var slug = Slugify(preferredStem);
        var digest = Convert.ToHexStringLower(SHA256.HashData(content))[..6];

        return $"{slug}-{digest}{extension}";
    }

    /// <summary>
    /// Reduces free text to lowercase ASCII words joined by hyphens. Anything that survives
    /// is safe in a file name on every platform; anything else is dropped rather than
    /// transliterated, since the slug is a convenience for reading the folder and the digest
    /// is what actually distinguishes one file from another.
    /// </summary>
    private static string Slugify(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return "image";

        var builder = new StringBuilder(text.Length);
        var pendingHyphen = false;

        foreach (var character in text.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
                continue;

            if (char.IsAsciiLetterOrDigit(character))
            {
                if (pendingHyphen && builder.Length > 0) builder.Append('-');
                pendingHyphen = false;
                builder.Append(char.ToLowerInvariant(character));

                // Long enough to stay recognisable, short enough that the digest and
                // extension are still visible in a Finder column.
                if (builder.Length == 48) break;
            }
            else
            {
                pendingHyphen = true;
            }
        }

        return builder.Length == 0 ? "image" : builder.ToString();
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
