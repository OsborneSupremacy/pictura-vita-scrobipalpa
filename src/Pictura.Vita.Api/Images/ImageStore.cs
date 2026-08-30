using Pictura.Vita.Utility;
using SkiaSharp;

namespace Pictura.Vita.Api.Images;

/// <summary>Why an image could not be produced. Every case draws as no image.</summary>
public enum ImageFailure
{
    /// <summary>No such image: no root, an unsafe name, or nothing on disk.</summary>
    NotFound,

    /// <summary>
    /// The file is there but its bytes could not be read. On this project's usual setup that
    /// almost always means iCloud has evicted it and cannot fetch it back right now — the
    /// data file lives in iCloud Drive with Optimise Mac Storage on, which leaves evicted
    /// files in place, full-sized and dataless, materialising on read.
    /// </summary>
    Unreadable,

    /// <summary>The bytes are there and are not an image this build can decode.</summary>
    Undecodable
}

/// <summary>
/// Finds, stores and resizes episode images.
///
/// The timeline holds only a file name; the bytes live beside the data file, outside the repo
/// and off any server. See docs/image-support.md for the layout and the reasoning.
/// </summary>
public sealed class ImageStore
{
    /// <summary>Longest edge of a generated thumbnail.</summary>
    private const int ThumbnailEdgePx = 320;

    /// <summary>
    /// Longest edge kept for an uploaded picture. A 48-megapixel phone photo is far more than
    /// the full-size view can show, and the image directory is meant to stay small enough to
    /// copy around.
    /// </summary>
    private const int StoredEdgePx = 2560;

    /// <summary>Largest upload accepted, before decoding.</summary>
    public const long MaxUploadBytes = 25L * 1024 * 1024;

    /// <summary>Extension every stored upload is normalised to.</summary>
    private const string StoredExtension = ".webp";

    private static readonly SKSamplingOptions Sampling = new(SKCubicResampler.Mitchell);

    private readonly string _root;
    private readonly string _cacheRoot;

    private ImageStore(string root, string cacheRoot)
    {
        _root = root;
        _cacheRoot = cacheRoot;
    }

    /// <summary>
    /// Where images are read from and written to. The directory need not exist yet — it is
    /// created on the first upload — so this is a resolved path, not a promise.
    /// </summary>
    public string Root => _root;

    public bool RootExists => Directory.Exists(_root);

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

        var configuredCache = Environment.GetEnvironmentVariable("IMAGE_CACHE_PATH");

        var cacheRoot = string.IsNullOrWhiteSpace(configuredCache)
            ? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "pictura-vita",
                "thumbnails")
            : Path.GetFullPath(configuredCache);

        return new ImageStore(root, cacheRoot);
    }

    /// <summary>
    /// The image file names present for a timeline.
    ///
    /// The client asks for this alongside the timeline so the renderer knows what exists
    /// before it lays anything out. Discovering a missing image from a 404 mid-render means
    /// a flash of broken image and a box that collapses after the fact; knowing up front
    /// makes "no image" and "image missing" the same code path.
    ///
    /// An iCloud-evicted file is listed like any other: on current macOS eviction leaves the
    /// file in place with its name and size intact and only drops the data, so presence here
    /// is still the right answer.
    /// </summary>
    public IReadOnlyList<string> List(Guid timelineId)
    {
        var directory = TimelineDirectory(timelineId);

        if (!Directory.Exists(directory)) return [];

        return Directory.EnumerateFiles(directory)
            .Select(Path.GetFileName)
            .Where(name => ImageFileName.IsValid(name))
            .Select(name => name!)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>
    /// The stored file for <paramref name="name"/>, or null when there is no such image.
    ///
    /// Null covers every way this can fail — no root, no timeline directory, an unsafe name,
    /// a name that escapes the root, a file that is not there. They are one outcome on
    /// purpose: the caller answers 404 to all of them, so probing reveals nothing about
    /// which files exist outside the sandbox.
    /// </summary>
    public FileInfo? Find(Guid timelineId, string? name)
    {
        var path = ImageFileName.ResolveWithin(TimelineDirectory(timelineId), name);
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

        // Read before decoding, so a file whose bytes cannot be fetched is told apart from one
        // whose bytes are not a picture. Conflating them used to fall back to serving the
        // original, which for an evicted file meant failing again *after* the response had
        // started — a truncated body rather than an honest 404.
        var bytes = Read(original, logger);
        if (bytes is null) return null;

        using var source = DecodeUpright(bytes);

        if (source is null)
        {
            logger.LogWarning(
                "{Path} is not an image this build can decode; it will draw as no image.",
                original.FullName);
            return null;
        }

        using var encoded = Resize(source, ThumbnailEdgePx, quality: 82);

        try
        {
            Directory.CreateDirectory(cacheDirectory);
            WriteAtomically(cached.FullName, encoded.Span, cacheDirectory);
            cached.Refresh();
            return cached;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Unlike an unreadable source, the picture itself is fine here — only the cache is
            // unwritable — so the original is a genuine fallback rather than a second failure.
            logger.LogWarning(
                exception,
                "Could not write a thumbnail for {Path}; serving the original instead.",
                original.FullName);
            return original;
        }
    }

    /// <summary>
    /// Stores an uploaded picture and returns the name the timeline should record.
    ///
    /// The bytes are decoded and re-encoded rather than copied through. That is what strips
    /// EXIF — including the GPS coordinates a phone writes into every photo, which for a
    /// picture of somewhere you lived is exactly the kind of data this application keeps off
    /// the network in the first place. It also settles what the file actually is: the decoder
    /// decides, not the extension or whatever content type the client claimed.
    /// </summary>
    public Result<string> Save(
        Guid timelineId,
        ReadOnlyMemory<byte> content,
        string? preferredStem,
        ILogger logger)
    {
        if (content.Length == 0)
            return new ArgumentException("The uploaded file is empty.");

        if (content.Length > MaxUploadBytes)
            return new ArgumentException(
                $"The image is {content.Length / (1024 * 1024)} MB; the limit is "
                + $"{MaxUploadBytes / (1024 * 1024)} MB.");

        using var source = DecodeUpright(content.Span);

        if (source is null)
            return new ArgumentException(
                "That file could not be read as an image. HEIC photos straight from an iPhone "
                + "are not supported — convert to JPEG or PNG first.");

        using var encoded = Resize(source, StoredEdgePx, quality: 90);

        var name = ImageFileName.Suggest(preferredStem, StoredExtension, encoded.Span);
        var directory = TimelineDirectory(timelineId);

        // Belt and braces over a name this class generated itself: the containment check is
        // the one thing standing between a file name and the rest of the disk, so it runs on
        // the write path too rather than being assumed from the read path.
        var destination = ImageFileName.ResolveWithin(directory, name);

        if (destination is null)
            return new InvalidOperationException($"Refusing to write \"{name}\" outside the image root.");

        try
        {
            Directory.CreateDirectory(directory);

            // Same content, same digest, same name: re-uploading a picture is a no-op rather
            // than a second copy.
            if (!File.Exists(destination))
                WriteAtomically(destination, encoded.Span, directory);

            logger.LogInformation("Stored image {Name} for timeline {TimelineId}.", name, timelineId);
            return name;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogError(exception, "Could not write {Destination}.", destination);
            return new IOException($"Could not write to the image directory at {directory}.");
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

    private string TimelineDirectory(Guid timelineId) => Path.Combine(_root, timelineId.ToString());

    private static byte[]? Read(FileInfo file, ILogger logger)
    {
        try
        {
            return File.ReadAllBytes(file.FullName);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(
                exception,
                "{Path} exists but could not be read; if it lives in iCloud Drive it may have "
                + "been evicted and cannot be fetched back right now. It will draw as no image.",
                file.FullName);
            return null;
        }
    }

    /// <summary>
    /// Decodes and rotates the picture the way it is meant to be seen.
    ///
    /// The rotation has to happen here because re-encoding discards EXIF, and the EXIF
    /// orientation tag is what tells a viewer to turn a phone photo upright. Strip it without
    /// applying it and every portrait photo comes out on its side.
    /// </summary>
    private static SKBitmap? DecodeUpright(ReadOnlySpan<byte> content)
    {
        using var data = SKData.CreateCopy(content.ToArray());
        using var codec = SKCodec.Create(data);

        if (codec is null) return null;

        var bitmap = SKBitmap.Decode(codec);
        return bitmap is null ? null : Upright(bitmap, codec.EncodedOrigin);
    }

    private static SKBitmap Upright(SKBitmap source, SKEncodedOrigin origin)
    {
        if (origin is SKEncodedOrigin.TopLeft or SKEncodedOrigin.Default) return source;

        var (width, height) = (source.Width, source.Height);

        // The four transposing orientations map a row to a column, so the result is the
        // source with its dimensions swapped.
        var transposes = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;

        var target = new SKBitmap(
            transposes ? height : width,
            transposes ? width : height,
            source.ColorType,
            source.AlphaType);

        // Each matrix maps a source pixel to where it belongs once upright, as defined by
        // EXIF orientations 1-8 in that order.
        var matrix = origin switch
        {
            SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, width, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, width, 0, -1, height, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, height, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new SKMatrix(0, -1, height, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, height, -1, 0, width, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, width, 0, 0, 1),
            _ => SKMatrix.Identity
        };

        using (var canvas = new SKCanvas(target))
        {
            canvas.SetMatrix(matrix);
            canvas.DrawBitmap(source, new SKPoint(0, 0), new SKSamplingOptions(SKFilterMode.Nearest));
        }

        source.Dispose();
        return target;
    }

    /// <summary>
    /// Scales the longest edge down to <paramref name="longestEdgePx"/> and encodes as WebP.
    /// An image already within the bound is re-encoded rather than enlarged.
    /// </summary>
    private static SKData Resize(SKBitmap source, int longestEdgePx, int quality)
    {
        var scale = Math.Min(1.0, (double)longestEdgePx / Math.Max(source.Width, source.Height));

        if (scale >= 1.0)
        {
            using var asIs = SKImage.FromBitmap(source);
            return asIs.Encode(SKEncodedImageFormat.Webp, quality);
        }

        var info = new SKImageInfo(
            Math.Max(1, (int)Math.Round(source.Width * scale)),
            Math.Max(1, (int)Math.Round(source.Height * scale)),
            SKColorType.Bgra8888,
            SKAlphaType.Premul);

        using var resized = source.Resize(info, Sampling);
        using var image = SKImage.FromBitmap(resized ?? source);
        return image.Encode(SKEncodedImageFormat.Webp, quality);
    }

    /// <summary>
    /// Writes under a temporary name and moves it into place, so a reader never sees a
    /// half-written file. Two requests for the same uncached thumbnail arrive together on a
    /// first render, and a partial file served to the other one decodes as garbage.
    /// </summary>
    private static void WriteAtomically(string destination, ReadOnlySpan<byte> content, string directory)
    {
        var temporary = Path.Combine(directory, $".{Guid.CreateVersion7()}.tmp");

        try
        {
            using (var output = File.Create(temporary))
                output.Write(content);

            File.Move(temporary, destination, overwrite: true);
        }
        catch
        {
            if (File.Exists(temporary)) File.Delete(temporary);
            throw;
        }
    }
}
