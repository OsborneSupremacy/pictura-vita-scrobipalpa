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
    }
}