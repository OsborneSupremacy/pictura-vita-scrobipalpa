namespace Pictura.Vita.Utility;

/// <summary>
/// Decides whether a stored narrative name is safe to resolve against a directory, and names
/// newly written ones.
///
/// A narrative is the long-form Markdown account of an episode — the anecdote behind the bar
/// on the timeline — kept as a file on disk rather than a field in the JSON store. The
/// path-traversal rules are the same ones images live under and are shared from
/// <see cref="StoredFileName"/>; what differs is the extension set and, importantly, how a
/// new name is chosen.
/// </summary>
public static class NarrativeFileName
{
    /// <summary>
    /// Only ".md". A second spelling (".markdown", ".txt") would buy nothing and cost a
    /// second answer to "what is this file called?" every time one is created by hand.
    /// </summary>
    public static readonly IReadOnlySet<string> AllowedExtensions =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".md" };

    /// <summary>Extension every narrative this application writes is given.</summary>
    public const string Extension = ".md";

    /// <summary>
    /// True when <paramref name="name"/> is a bare Markdown file name. Empty is not safe —
    /// it is "no narrative", which callers must handle before asking.
    /// </summary>
    public static bool IsValid(string? name) => StoredFileName.IsValid(name, AllowedExtensions);

    /// <summary>
    /// The absolute path <paramref name="name"/> resolves to inside <paramref name="root"/>,
    /// or null when it is not a legal narrative name or escapes the root.
    /// </summary>
    public static string? ResolveWithin(string root, string? name) =>
        StoredFileName.ResolveWithin(root, name, AllowedExtensions);

    /// <summary>
    /// A file name for a narrative that does not have one yet: a slug of
    /// <paramref name="preferredStem"/>, made unique against <paramref name="isTaken"/> with
    /// a counter — "moving-to-kalamazoo.md", then "moving-to-kalamazoo-2.md".
    ///
    /// Deliberately *not* content-addressed the way an image name is. An image is replaced;
    /// a narrative is edited, and a name derived from the text would change on every save,
    /// leaving a new file behind each time and breaking the reference the episode holds. The
    /// name has to be stable across edits, so it is derived from the title once and then
    /// kept — which is also why the episode stores it rather than deriving it on read.
    ///
    /// The counter runs against a predicate rather than the file system so the rule can be
    /// tested without a directory, and so the store stays the only thing that touches disk.
    /// </summary>
    public static string Suggest(string? preferredStem, Func<string, bool> isTaken)
    {
        var slug = StoredFileName.Slugify(preferredStem);
        var candidate = slug + Extension;

        // Two episodes can honestly share a title ("Moved house"), so a collision is a normal
        // event rather than an error. The bound is a guard against a predicate that always
        // says yes, not a real limit anyone will reach.
        for (var suffix = 2; isTaken(candidate) && suffix < 10_000; suffix++)
            candidate = $"{slug}-{suffix}{Extension}";

        return candidate;
    }
}
