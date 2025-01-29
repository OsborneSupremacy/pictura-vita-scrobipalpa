namespace Pictura.Vita.Api.Validators;

internal class PersonValidator : AbstractValidator<Person>
{
    public PersonValidator()
    {
        RuleFor(x => x.NameParts).Must(x => x.Any());
        RuleFor(x => x.BirthPrecision).NotNull();
        RuleFor(x => x.Birth).NotNull();
        RuleFor(x => x.DeathPrecision).NotNull();
        RuleFor(x => x.Death).NotNull();
        RuleFor(x => x.Death).GreaterThanOrEqualTo(x => x.Birth);
    }
}