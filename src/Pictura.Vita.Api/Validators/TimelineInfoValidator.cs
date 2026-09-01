namespace Pictura.Vita.Api.Validators;

internal class TimelineInfoValidator : AbstractValidator<TimelineInfo>
{
    /// <summary>
    /// The longest span a timeline may cover, in whole years.
    /// <para>
    /// Mirrors <c>MAX_SPAN_YEARS</c> in <c>web/pictura-vita-app/src/layout/span.ts</c>, which
    /// is where the reasoning is written down. The two are a pair and have to move together:
    /// the client refuses the save in the dialog, and this backstops it for anything reaching
    /// the API another way. It is a legibility limit, not a performance one — the window is
    /// always fitted to the surface's width, so span and pixels-per-year trade off directly.
    /// </para>
    /// </summary>
    private const int MaxSpanYears = 1000;

    private readonly TimeProvider _timeProvider;

    public TimelineInfoValidator(TimeProvider timeProvider)
    {
        _timeProvider = timeProvider;

        RuleFor(x => x.Title).NotEmpty();
        RuleFor(x => x.Subtitle).NotNull();
        RuleFor(x => x.TimelineSubject).NotNull();
        RuleFor(x => x.TimelineSubject).SetValidator(new TimelineSubjectValidator());
        RuleFor(x => x.Start).NotNull();
        RuleFor(x => x.End).NotNull();
        RuleFor(x => x.End).GreaterThanOrEqualTo(x => x.Start);
        RuleFor(x => x.End)
            .Equal(DateOnly.MaxValue)
            .When(x => x.Ongoing)
            .WithMessage("An ongoing timeline must have an end date of 9999-12-31.");
        RuleFor(x => x.End)
            .NotEqual(DateOnly.MaxValue)
            .When(x => !x.Ongoing)
            .WithMessage("A timeline that is not ongoing must have a real end date.");
        RuleFor(x => x)
            .Must(BeWithinTheMaximumSpan)
            // The rule is over the whole record, which would otherwise report against an
            // empty property name; the start date is the end a caller can usefully move.
            .WithName(nameof(TimelineInfo.Start))
            .WithMessage(info =>
                $"A timeline can cover at most {MaxSpanYears:N0} years; " +
                $"this one covers {SpanYears(info):N0}.");
    }

    /// <summary>
    /// The last date the timeline is actually drawn to. An ongoing timeline stores the
    /// <see cref="DateOnly.MaxValue"/> sentinel but runs to today, so measuring the stored
    /// <see cref="TimelineInfo.End"/> would make every one of them eight thousand years wide.
    /// </summary>
    private DateOnly DrawnEnd(TimelineInfo info) =>
        info.Ongoing || info.End == DateOnly.MaxValue
            ? DateOnly.FromDateTime(_timeProvider.GetLocalNow().DateTime)
            : info.End;

    /// <summary>
    /// Whole years covered, counted as elapsed anniversaries of the start rather than as a
    /// division of the day count, so leap years cannot round a legal span over the limit.
    /// Zero for an inverted range, which the <c>End >= Start</c> rule already reports.
    /// </summary>
    private int SpanYears(TimelineInfo info)
    {
        var end = DrawnEnd(info);
        if (end < info.Start) return 0;

        var years = end.Year - info.Start.Year;
        if (end < info.Start.AddYears(years)) years -= 1;

        return years;
    }

    private bool BeWithinTheMaximumSpan(TimelineInfo info) => SpanYears(info) <= MaxSpanYears;
}
