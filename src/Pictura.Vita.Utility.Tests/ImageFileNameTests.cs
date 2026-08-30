using System.Text;

namespace Pictura.Vita.Utility.Tests;

/// <summary>
/// <see cref="ImageFileName"/> is the boundary between a name held in a data file and the
/// rest of the disk. It is reached from the read path (serving an image), the write path
/// (storing an upload) and validation, so it is worth pinning down directly rather than only
/// through whichever endpoint happens to call it.
/// </summary>
public class ImageFileNameTests
{
    [Theory]
    [InlineData("kalamazoo-house.jpg")]
    [InlineData("first-day.jpeg")]
    [InlineData("logo.PNG")]          // the extension check is case-insensitive
    [InlineData("scan.webp")]
    [InlineData("animation.gif")]
    [InlineData("cornerstone-church.jpg.webp")]  // the last extension is the one that counts
    public void IsValid_AcceptsABareNameWithASupportedExtension(string name) =>
        ImageFileName.IsValid(name).Should().BeTrue();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("photo")]                    // no extension
    [InlineData("notes.txt")]
    [InlineData("photo.heic")]               // decodable by nothing in this build
    [InlineData("photo.HEIC")]
    [InlineData("../secrets.jpg")]
    [InlineData("../../etc/passwd.jpg")]
    [InlineData("sub/dir/photo.jpg")]
    [InlineData("sub\\dir\\photo.jpg")]      // a path on Windows, a legal name on macOS
    [InlineData("/etc/passwd.jpg")]
    [InlineData("..")]
    [InlineData(".")]
    public void IsValid_RejectsAnythingElse(string? name) =>
        ImageFileName.IsValid(name).Should().BeFalse();

    [Fact]
    public void ResolveWithin_ReturnsThePathInsideTheRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "pv-images");

        ImageFileName.ResolveWithin(root, "house.jpg")
            .Should()
            .Be(Path.Combine(Path.GetFullPath(root), "house.jpg"));
    }

    [Theory]
    [InlineData("../escape.jpg")]
    [InlineData("../../escape.jpg")]
    [InlineData("sub/escape.jpg")]
    [InlineData("/absolute/escape.jpg")]
    [InlineData("escape.txt")]
    public void ResolveWithin_RefusesToLeaveTheRoot(string name) =>
        ImageFileName.ResolveWithin(Path.Combine(Path.GetTempPath(), "pv-images"), name)
            .Should()
            .BeNull();

    [Fact]
    public void ResolveWithin_TreatsAPercentEncodedNameAsALiteralName()
    {
        // "..%2fescape.jpg" contains no separator: it is a strange but perfectly legal file
        // name, and it resolves inside the root like any other. Decoding is the HTTP layer's
        // job and has already happened by the time a name arrives here — decoding a second
        // time is how a traversal gets smuggled past a check like this one.
        var root = Path.Combine(Path.GetTempPath(), "pv-images");

        ImageFileName.ResolveWithin(root, "..%2fescape.jpg")
            .Should()
            .Be(Path.Combine(Path.GetFullPath(root), "..%2fescape.jpg"));
    }

    [Fact]
    public void ResolveWithin_IsNotFooledByARootThatPrefixesASibling()
    {
        // "/tmp/pv-images-other" starts with "/tmp/pv-images" as a string. Containment has to
        // be checked a directory at a time, not by comparing prefixes.
        var root = Path.Combine(Path.GetTempPath(), "pv-images");
        var resolved = ImageFileName.ResolveWithin(root, "house.jpg");

        resolved.Should().StartWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar);
        resolved.Should().NotStartWith(Path.GetFullPath(root) + "-other");
    }

    [Fact]
    public void Suggest_BuildsAReadableNameFromTheTitleAndTheContent()
    {
        var name = ImageFileName.Suggest(
            "Cornerstone Church — Waukesha & Delafield, WI",
            ".webp",
            "pretend this is a picture"u8);

        name.Should().MatchRegex("^cornerstone-church-waukesha-delafield-wi-[0-9a-f]{6}\\.webp$");
        ImageFileName.IsValid(name).Should().BeTrue();
    }

    [Fact]
    public void Suggest_IsStableForTheSameContent()
    {
        var content = "identical bytes"u8;

        ImageFileName.Suggest("Holiday", ".webp", content)
            .Should()
            .Be(ImageFileName.Suggest("Holiday", ".webp", content));
    }

    [Fact]
    public void Suggest_SeparatesTwoPicturesSharingATitle()
    {
        ImageFileName.Suggest("Holiday", ".webp", "one"u8)
            .Should()
            .NotBe(ImageFileName.Suggest("Holiday", ".webp", "two"u8));
    }

    [Theory]
    [InlineData("../../etc/passwd")]
    [InlineData("///")]
    [InlineData("....")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("   ")]
    [InlineData("🎉🎉🎉")]
    public void Suggest_ProducesASafeNameFromAHostileOrEmptyTitle(string? stem)
    {
        // The title reaches this from a text box, so it is as untrusted as anything else.
        var name = ImageFileName.Suggest(stem, ".webp", "bytes"u8);

        ImageFileName.IsValid(name).Should().BeTrue();
        name.Should().NotContain("..");
        name.Should().NotContain("/");
        name.Should().NotContain("\\");
    }

    [Fact]
    public void Suggest_KeepsTheNameShortEnoughToRead()
    {
        var name = ImageFileName.Suggest(new string('a', 400), ".webp", "bytes"u8);

        // 48 slug characters, a hyphen, six of digest, and the extension.
        name.Length.Should().Be(48 + 1 + 6 + ".webp".Length);
        ImageFileName.IsValid(name).Should().BeTrue();
    }

    [Fact]
    public void Suggest_NamesAreAcceptedByTheReadPath()
    {
        var root = Path.Combine(Path.GetTempPath(), "pv-images");
        var name = ImageFileName.Suggest("A Day Out", ".webp", "bytes"u8);

        // The two halves have to agree: a name the writer generates must be one the reader
        // will serve, or an upload succeeds and then draws as nothing.
        ImageFileName.ResolveWithin(root, name).Should().NotBeNull();
    }
}
