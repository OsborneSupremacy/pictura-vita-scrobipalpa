namespace Pictura.Vita.Api.Validators;

internal class OrganizationValidator : AbstractValidator<Organization>
{
    public OrganizationValidator()
    {
        RuleFor(x => x.Name).NotEmpty();
        RuleFor(x => x.StartPrecision).NotNull();
        RuleFor(x => x.Start).NotNull();
        RuleFor(x => x.EndPrecision).NotNull();
        RuleFor(x => x.End).NotNull();
        RuleFor(x => x.End).GreaterThanOrEqualTo(x => x.Start);
        RuleFor(x => x.End)
            .Equal(DateOnly.MaxValue)
            .When(x => x.Ongoing)
            .WithMessage("An ongoing organization must have an end date of 9999-12-31.");
        RuleFor(x => x.End)
            .NotEqual(DateOnly.MaxValue)
            .When(x => !x.Ongoing)
            .WithMessage("An organization that has ended must have a real end date.");
    }
}