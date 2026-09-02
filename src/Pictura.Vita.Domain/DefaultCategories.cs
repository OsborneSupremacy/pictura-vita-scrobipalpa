namespace Pictura.Vita.Domain;

/// <summary>
/// The categories a brand-new timeline starts with.
///
/// A timeline with no categories draws nothing at all, so the first thing a new one asks of
/// you is a decision — what are the bands? — before you have any episodes to decide it from.
/// These are a starting spine to tag against, not a schema: rename them, reorder them, delete
/// the ones that do not apply.
///
/// Seeding is free in display terms. The layout drops any band holding no episodes (see the
/// filter at the end of <c>buildLayout</c> in the front end's layout module), so an unused
/// default is invisible on the timeline and shows up only in the categories dialog and the
/// filter list. Nothing here clutters a timeline until it is actually used.
///
/// Every set is deliberately generic. A default must not assume you have children, a religion,
/// a car or a job — where one of those is common enough to earn a place, the title is the
/// broad one ("Relationships", "Travel") rather than the specific one.
/// </summary>
public static class DefaultCategories
{
    /// <summary>
    /// The categories for a new timeline about <paramref name="subjectType"/>.
    ///
    /// Built fresh on every call rather than held in a static list, because each
    /// <see cref="Category.CategoryId"/> has to be new — a cached set would give every timeline
    /// ever created the same category ids, and an episode's <c>CategoryIds</c> would then point
    /// into whichever timeline you happened to be looking at.
    /// </summary>
    public static IReadOnlyList<Category> For(SubjectType subjectType) =>
        subjectType == SubjectType.Organization ? Organization() : Person();

    /// <summary>
    /// A life. Drawn from a real timeline of 169 episodes, trimmed to what is common to most
    /// people: its owner also keeps Church, Dinners, Business Trips, Kids, Pets and Skills,
    /// which are exactly the kind of thing to add yourself rather than be handed.
    /// </summary>
    private static Category[] Person() =>
    [
        Make(0, "Residence", "house"),
        Make(1, "Education", "graduation-cap"),
        Make(2, "Employment", "building"),
        Make(3, "Family", "users"),
        Make(4, "Relationships", "heart-handshake"),
        Make(5, "Health", "heart-pulse"),
        Make(6, "Travel", "plane"),
        Make(7, "Vehicles", "car"),
        Make(8, "Interests", "brain"),
        // The bucket for things that are a story rather than a period — the anniversary post,
        // the account of a trip. These are what narratives are for; see narrative-support.md.
        Make(9, "Anecdotes", "book-open")
    ];

    /// <summary>
    /// An organisation — a company, an institution, a charity. The shape of an organisation's
    /// history is different enough from a person's that almost none of the titles carry over.
    /// </summary>
    private static Category[] Organization() =>
    [
        Make(0, "Locations", "map-pin"),
        Make(1, "Leadership", "users"),
        Make(2, "Products", "package"),
        Make(3, "Funding", "banknote"),
        Make(4, "Milestones", "milestone"),
        Make(5, "Partnerships", "handshake"),
        Make(6, "Events", "calendar-days"),
        Make(7, "Awards", "award")
    ];

    /// <summary>
    /// One default category.
    ///
    /// <see cref="Category.Confidentiality"/> is <see cref="Confidentiality.OnlyMe"/>, matching
    /// what the categories dialog gives a category added by hand: the private end of the scale
    /// is the only safe default for something that has not been looked at yet.
    ///
    /// <see cref="Category.Color"/> is left empty, which means "colour this band from its
    /// position". Ten categories with ten hard-coded colours would fight the palette the moment
    /// one of them was deleted.
    /// </summary>
    private static Category Make(int sortOrder, string title, string icon) => new()
    {
        CategoryId = Guid.CreateVersion7(),
        Title = title,
        Subtitle = string.Empty,
        Description = string.Empty,
        Confidentiality = Confidentiality.OnlyMe,
        SortOrder = sortOrder,
        Icon = icon,
        Color = string.Empty
    };
}
