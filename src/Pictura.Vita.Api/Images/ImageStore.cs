using Pictura.Vita.Utility;
using SkiaSharp;

namespace Pictura.Vita.Api.Images;

/// <summary>
/// Finds an episode's image on disk and produces the thumbnail drawn on the timeline.
///
/// The store holds only a file name; the bytes live beside the data file, outside the repo
/// and off any server. See docs/image-support.md for the layout and the reasoning.
/// </summary>
public sealed class ImageStore
{
    /// <summary>Longest edge of a generated thumbnail.</summary>
    private const int ThumbnailEdgePx = 320;

    private static readonly SKSamplingOptions Sampling =
        new(SKCubicResampler.Mitchell);

    /// <summary>Null when no image root exists; every lookup then answers "no image".</summary>
    private readonly string? _root;

    private readonly string _cacheRoot;

    private ImageStore(string? root, string cacheRoot)
    {
        _root = root;
        _cacheRoot = cacheRoot;
    }

    /// <summary>
    /// Where images are read from, or null when there is no such directory. Exposed so
    /// startup can say which path was chosen — a silent "no images anywhere" is otherwise
    /// indistinguishable from a mistyped path.
    /// </summary>
    public string? Root => _root;

    /// <summary>
    /// Resolves the image root from configuration.
    ///
    /// IMAGE_ROOT_PATH wins if set; otherwise the root is derived as "images" beside the
    /// data file. Deriving it is the default on purpose: two independently configured paths
    /// can drift apart, and then the claim that a timeline is one portable directory quietly
    /// stops being true.
    ///
    /// Unlike DATA_FILE_PATH, a missing root is not a startup failure. Images are optional,
    /// and a timeline with none is a perfectly normal timeline.
    /// </summary>
    public static ImageStore Create(string dataFilePath)
    {
        var configured = Environment.GetEnvironmentVariable("IMAGE_ROOT_PATH");

        var root = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(Path.GetDirectoryName(Path.GetFullPath(dataFilePath)) ?? ".", "images")
            : Path.GetFullPath(configured);

        var cacheRoot = Environment.GetEnvironmentVariable("IMAGE_CACHE_PATH") is { } configuredCache
                        && !string.IsNullOrWhiteSpace(configuredCache)
            ? Path.GetFullPath(configuredCache)
            : Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "pictura-vita",
                "thumbnails");

        return new ImageStore(Directory.Exists(root) ? root : null, cacheRoot);
    }

    /// <summary>
    /// The image file names actually present for a timeline.
    ///
    /// The client asks for this alongside the timeline so the renderer knows what exists
    /// before it lays anything out. Discovering a missing image from a 404 mid-render means
    /// a flash of broken image and a box that collapses after the fact; knowing up front
    /// makes "no image" and "image missing" the same code path.
    /// </summary>
    public IReadOnlyList<string> List(Guid timelineId)
    {
        var directory = TimelineDirectory(timelineId);

        if (directory is null || !Directory.Exists(directory)) return [];

        return Directory.EnumerateFiles(directory)
            .Select(Path.GetFileName)
            .Where(name => ImageFileName.IsValid(name))
            .Select(name => name!)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>
    /// The original file for <paramref name="name"/>, or null when there is no such image.
    ///
    /// Null covers every way this can fail — no root, no timeline directory, an unsafe name,
    /// a name that escapes the root, a file that is not there. They are one outcome on
    /// purpose: the caller answers 404 to all of them, so probing reveals nothing about
    /// which files exist outside the sandbox.
    /// </summary>
    public FileInfo? Find(Guid timelineId, string? name)
    {
        var directory = TimelineDirectory(timelineId);
        if (directory is null) return null;

        var path = ImageFileName.ResolveWithin(directory, name);
        if (path is null) return null;

        var file = new FileInfo(path);
        return file.Exists ? file : null;
    }

    /// <summary>
    /// The cached thumbnail for an image, generating it when absent or stale.
    ///
    /// Thumbnails are derived data, so they live in a cache directory this class owns rather
    /// than beside the originals. Keeping two sizes in the portable directory would make
    /// every image a two-step manual chore, and the two would drift the first time a photo
    /// was replaced.
    ///
    /// Returns null when the original is missing or cannot be decoded — a HEIC straight off
    /// an iPhone, most often, which is why the extension allow-list excludes it. When only
    /// the cache write fails, the original comes back instead: a thumbnail is an
    /// optimisation, and an unwritable cache directory should not cost you the picture.
    /// </summary>
    public FileInfo? Thumbnail(Guid timelineId, string? name, ILogger logger)
    {
        var original = Find(timelineId, name);
        if (original is null) return null;

        var cacheDirectory = Path.Combine(_cacheRoot, timelineId.ToString());
        var cached = new FileInfo(Path.Combine(
            cacheDirectory,
            $"{Path.GetFileNameWithoutExtension(original.Name)}@{ThumbnailEdgePx}.webp"));

        // Regenerate when the original has been replaced since the thumbnail was written.
        if (cached.Exists && cached.LastWriteTimeUtc >= original.LastWriteTimeUtc) return cached;

        try
        {
            Directory.CreateDirectory(cacheDirectory);

            using var source = SKBitmap.Decode(original.FullName);

            if (source is null)
            {
                logger.LogWarning(
                    "Could not decode {Path} as an image; it will draw as no image.",
                    original.FullName);
                return null;
            }

            var scale = Math.Min(
                1.0,
                (double)ThumbnailEdgePx / Math.Max(source.Width, source.Height));

            var width = Math.Max(1, (int)Math.Round(source.Width * scale));
            var height = Math.Max(1, (int)Math.Round(source.Height * scale));

            var info = new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul);
            using var resized = source.Resize(info, Sampling);

            if (resized is null) return null;

            using var image = SKImage.FromBitmap(resized);
            using var encoded = image.Encode(SKEncodedImageFormat.Webp, 82);

            // Written under a temporary name and moved into place: two requests for the same
            // uncached thumbnail arrive together on a first render, and a half-written file
            // served to the other one would decode as garbage.
            var temporary = Path.Combine(cacheDirectory, $"{Guid.CreateVersion7()}.tmp");

            using (var output = File.Create(temporary))
                encoded.SaveTo(output);

            File.Move(temporary, cached.FullName, overwrite: true);

            cached.Refresh();
            return cached;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Distinct from the undecodable case above, which returns null: there the bytes
            // are no good to anyone, so falling back would only hand the browser something it
            // cannot draw either. Here the picture is fine and only the cache is unwritable.
            logger.LogWarning(
                exception,
                "Could not write a thumbnail for {Path}; serving the original instead.",
                original.FullName);
            return original;
        }
    }

    /// <summary>Content type for a name already checked by <see cref="ImageFileName"/>.</summary>
    public static string ContentType(string name) => Path.GetExtension(name).ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        _ => "application/octet-stream"
    };

    private string? TimelineDirectory(Guid timelineId) =>
        _root is null ? null : Path.Combine(_root, timelineId.ToString());
}
