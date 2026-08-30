using System.Security.Cryptography;

namespace Pictura.Vita.Utility;

/// <summary>
/// Decides whether a stored image name is safe to resolve against a directory, and names
/// freshly uploaded pictures.
///
/// The rules live in <see cref="StoredFileName"/>, shared with narratives; this type fixes
/// the extensions and the naming scheme that are particular to images. It lives in the
/// utility assembly rather than the API so the write path (validators, the importer) and the
/// read path (the image store) cannot disagree about what a legal name is.
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
    public static bool IsValid(string? name) => StoredFileName.IsValid(name, AllowedExtensions);

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
    ///
    /// Narratives are named differently — see <see cref="NarrativeFileName.Suggest"/> — for
    /// the reason content addressing works here and would not work there: an image is
    /// replaced, a narrative is edited.
    /// </summary>
    public static string Suggest(string? preferredStem, string extension, ReadOnlySpan<byte> content)
    {
        var slug = StoredFileName.Slugify(preferredStem);
        var digest = Convert.ToHexStringLower(SHA256.HashData(content))[..6];

        return $"{slug}-{digest}{extension}";
    }

    /// <summary>
    /// The absolute path <paramref name="name"/> resolves to inside <paramref name="root"/>,
    /// or null when it is not a legal image name or escapes the root.
    /// </summary>
    public static string? ResolveWithin(string root, string? name) =>
        StoredFileName.ResolveWithin(root, name, AllowedExtensions);
}
