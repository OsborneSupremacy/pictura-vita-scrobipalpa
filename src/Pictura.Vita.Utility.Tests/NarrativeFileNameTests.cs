namespace Pictura.Vita.Utility.Tests;

/// <summary>
/// <see cref="NarrativeFileName"/> is the same boundary <see cref="ImageFileName"/> is — a
/// name held in a data file, resolved against a directory — so the traversal cases are worth
/// pinning down here too rather than trusting that the shared implementation is reached.
///
/// The naming rule is genuinely different and is the reason this type exists separately: an
/// image is content-addressed because it is replaced, while a narrative is edited, so its
/// name must survive its text changing.
/// </summary>
public class NarrativeFileNameTests
{
    [Theory]
    [InlineData("moving-to-kalamazoo.md")]
    [InlineData("The Speeding Ticket.MD")]   // the extension check is case-insensitive
    [InlineData("notes.txt.md")]             // the last extension is the one that counts
    public void IsValid_AcceptsABareMarkdownName(string name) =>
        NarrativeFileName.IsValid(name).Should().BeTrue();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("story")]                    // no extension
    [InlineData("story.txt")]
    [InlineData("story.markdown")]           // one spelling only, on purpose
    [InlineData("story.md.jpg")]
    [InlineData("../secrets.md")]
    [InlineData("../../etc/passwd.md")]
    [InlineData("sub/dir/story.md")]
    [InlineData("sub\\dir\\story.md")]       // a path on Windows, a legal name on macOS
    [InlineData("/etc/passwd.md")]
    [InlineData("..")]
    [InlineData(".")]
    public void IsValid_RejectsAnythingElse(string? name) =>
        NarrativeFileName.IsValid(name).Should().BeFalse();

    [Fact]
    public void ResolveWithin_ReturnsThePathInsideTheRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "pv-narratives");

        NarrativeFileName.ResolveWithin(root, "moving-to-kalamazoo.md")
            .Should()
            .Be(Path.Combine(Path.GetFullPath(root), "moving-to-kalamazoo.md"));
    }

    [Theory]
    [InlineData("../escape.md")]
    [InlineData("../../escape.md")]
    [InlineData("sub/escape.md")]
    [InlineData("/absolute/escape.md")]
    [InlineData("escape.txt")]
    public void ResolveWithin_RefusesToLeaveTheRoot(string name) =>
        NarrativeFileName.ResolveWithin(Path.Combine(Path.GetTempPath(), "pv-narratives"), name)
            .Should()
            .BeNull();

    [Fact]
    public void Suggest_BuildsAReadableNameFromTheTitle()
    {
        var name = NarrativeFileName.Suggest("Moving to Kalamazoo — the second time", _ => false);

        name.Should().Be("moving-to-kalamazoo-the-second-time.md");
        NarrativeFileName.IsValid(name).Should().BeTrue();
    }

    /// <summary>
    /// The point of the whole naming scheme: editing the text must not move the file, or the
    /// episode's reference to it breaks and the old copy is left behind.
    /// </summary>
    [Fact]
    public void Suggest_DependsOnTheTitleAloneAndNotOnAnyContent()
    {
        NarrativeFileName.Suggest("Moved house", _ => false)
            .Should()
            .Be(NarrativeFileName.Suggest("Moved house", _ => false));
    }

    [Fact]
    public void Suggest_CountsPastANameAlreadyInUse()
    {
        var taken = new HashSet<string> { "moved-house.md", "moved-house-2.md" };

        NarrativeFileName.Suggest("Moved house", taken.Contains)
            .Should()
            .Be("moved-house-3.md");
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
        var name = NarrativeFileName.Suggest(stem, _ => false);

        NarrativeFileName.IsValid(name).Should().BeTrue();
        name.Should().NotContain("..");
        name.Should().NotContain("/");
        name.Should().NotContain("\\");
    }

    [Fact]
    public void Suggest_NamesAreAcceptedByTheReadPath()
    {
        var root = Path.Combine(Path.GetTempPath(), "pv-narratives");
        var name = NarrativeFileName.Suggest("A Day Out", _ => false);

        // The two halves have to agree: a name the writer generates must be one the reader
        // will serve, or a narrative saves successfully and then cannot be opened.
        NarrativeFileName.ResolveWithin(root, name).Should().NotBeNull();
    }
}
