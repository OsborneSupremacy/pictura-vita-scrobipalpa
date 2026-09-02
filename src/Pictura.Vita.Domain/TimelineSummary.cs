namespace Pictura.Vita.Domain;

/// <summary>
/// Enough of a timeline to list it without reading all of it.
///
/// The table of contents draws a card per timeline, and a card that shows only a title says
/// nothing useful when a person keeps several. The counts and the span are cheap — they come
/// out of a parse the listing has to do anyway — and they are what tells one timeline from
/// another at a glance.
/// </summary>
public record TimelineSummary
{
    public required Guid TimelineId { get; init; }

    public required string Title { get; init; }

    public required string Subtitle { get; init; }

    /// <summary>The first date the timeline covers. Mirrors <see cref="TimelineInfo.Start"/>.</summary>
    public required DateOnly Start { get; init; }

    /// <summary>
    /// The last date the timeline covers, or <see cref="DateOnly.MaxValue"/> when
    /// <see cref="Ongoing"/> is true. Mirrors <see cref="TimelineInfo.End"/>.
    /// </summary>
    public required DateOnly End { get; init; }

    /// <summary>True when the timeline runs to today. Mirrors <see cref="TimelineInfo.Ongoing"/>.</summary>
    public required bool Ongoing { get; init; }

    public required int EpisodeCount { get; init; }

    public required int CategoryCount { get; init; }
}
