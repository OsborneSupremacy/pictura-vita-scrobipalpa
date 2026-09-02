namespace Pictura.Vita.Domain;

/// <summary>
/// The one episode each default category starts with.
///
/// Without it a new timeline is blank however many categories it has: the layout draws only
/// bands that hold something, so a category with no episodes is invisible and the app opens on
/// "Nothing matches the current filters". One placeholder apiece makes every band draw, so the
/// categories you have been given are the first thing you see rather than something you have to
/// go looking for in a dialog.
///
/// They are meant to be thrown away — the subtitle says so — and deleting one is permanent and
/// harmless, since nothing refers to an episode.
/// </summary>
public static class PlaceholderEpisodes
{
    public const string Title = "Placeholder";

    public const string Subtitle = "Can be deleted";

    /// <summary>
    /// One placeholder per category, each tagged with that category alone.
    /// </summary>
    /// <param name="categories">The categories to fill. Usually <see cref="DefaultCategories"/>.</param>
    /// <param name="on">
    /// The day to place them on — the timeline's own start date.
    /// <para>
    /// Deliberately not today, which is what the episode dialog uses for a new episode. Today
    /// is inside the window only while a timeline is ongoing; on one that ended in the past it
    /// falls outside, and a placeholder nobody can see does not do the one job it has. The
    /// start date is the floor of the drawn window by definition, so it always lands.
    /// </para>
    /// </param>
    public static IReadOnlyList<Episode> For(IEnumerable<Category> categories, DateOnly on) =>
        [.. categories.Select(category => Make(category, on))];

    private static Episode Make(Category category, DateOnly on) => new()
    {
        EpisodeId = Guid.CreateVersion7(),
        Title = Title,
        Subtitle = Subtitle,
        Description = string.Empty,
        Url = string.Empty,
        UrlDescription = string.Empty,
        ImageName = string.Empty,
        NarrativeName = string.Empty,
        // A single day, which is what makes it an Incident rather than an Era — the same rule
        // the provider applies to an episode arriving from the dialog. It draws as a callout, so
        // a placeholder reads as a marker rather than as a bar spanning a life nobody has
        // recorded yet.
        EpisodeType = EpisodeType.Incident,
        StartPrecision = DatePrecision.Day,
        Start = on,
        EndPrecision = DatePrecision.Day,
        End = on,
        Indefinite = false,
        // Inherit, matching what the episode dialog gives a new episode: the placeholder takes
        // its category's confidentiality rather than asserting one of its own.
        Confidentiality = Confidentiality.Inherit,
        CategoryIds = [category.CategoryId]
    };
}
