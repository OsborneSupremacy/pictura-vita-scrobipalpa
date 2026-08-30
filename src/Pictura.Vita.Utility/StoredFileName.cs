using System.Globalization;
using System.Text;

namespace Pictura.Vita.Utility;

/// <summary>
/// The one place that decides whether a name held in a data file is safe to resolve against
/// a directory on disk.
///
/// Every kind of side file the application stores — images, narratives — arrives the same
/// way: as a bare name inside the timeline file, and a timeline file is an input. It is
/// written by the Excel importer, hand-edited, and copied between machines. Joining an
/// unchecked name to a root would let "../../.ssh/id_rsa" out of the sandbox, and the API is
/// an HTTP server on loopback that any page open in the browser can reach.
///
/// The rules are identical for every kind; only the set of extensions differs. Keeping one
/// implementation is the point: two copies of a path-traversal check are two chances for the
/// read path and the write path to disagree about what a legal name is.
/// See <see cref="ImageFileName"/> and <see cref="NarrativeFileName"/> for the typed fronts.
/// </summary>
public static class StoredFileName
{
    /// <summary>
    /// True when <paramref name="name"/> is a bare file name whose extension is in
    /// <paramref name="allowedExtensions"/>. Empty is not safe — it is "no file", which
    /// callers must handle before asking.
    /// </summary>
    public static bool IsValid(string? name, IReadOnlySet<string> allowedExtensions)
    {
        if (string.IsNullOrWhiteSpace(name)) return false;

        // Rejects separators, "..", rooted paths, and volume prefixes in one comparison:
        // GetFileName returns something different from its input for every one of them.
        if (!string.Equals(Path.GetFileName(name), name, StringComparison.Ordinal)) return false;

        // GetFileName leaves these alone on the wrong platform — "a\b.jpg" is a legal file
        // name on macOS but a path on Windows, and the data file travels between them.
        if (name.Contains('/') || name.Contains('\\')) return false;

        if (name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return false;

        return allowedExtensions.Contains(Path.GetExtension(name));
    }

    /// <summary>
    /// The absolute path <paramref name="name"/> resolves to inside <paramref name="root"/>,
    /// or null when it is not a legal name or escapes the root.
    ///
    /// The containment check is repeated after resolution rather than trusted from
    /// <see cref="IsValid"/> alone: symlinks and case-insensitive volumes make the textual
    /// check a necessary condition, not a sufficient one.
    /// </summary>
    public static string? ResolveWithin(string root, string? name, IReadOnlySet<string> allowedExtensions)
    {
        if (!IsValid(name, allowedExtensions)) return null;

        var rootFull = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        var candidate = Path.GetFullPath(Path.Combine(rootFull, name!));

        var prefix = rootFull + Path.DirectorySeparatorChar;

        return candidate.StartsWith(prefix, StringComparison.Ordinal) ? candidate : null;
    }

    /// <summary>
    /// Reduces free text to lowercase ASCII words joined by hyphens. Anything that survives
    /// is safe in a file name on every platform; anything else is dropped rather than
    /// transliterated, since the slug exists so that whoever opens the folder can tell the
    /// files apart, not to round-trip the title.
    /// </summary>
    public static string Slugify(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return "untitled";

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

                // Long enough to stay recognisable, short enough that any suffix and the
                // extension are still visible in a Finder column.
                if (builder.Length == 48) break;
            }
            else
            {
                pendingHyphen = true;
            }
        }

        return builder.Length == 0 ? "untitled" : builder.ToString();
    }
}
