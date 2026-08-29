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
        RuleFor(x => x.Death)
            .Equal(DateOnly.MaxValue)
            .When(x => x.Living)
            .WithMessage("A living person must have a death date of 9999-12-31.");
        RuleFor(x => x.Death)
            .NotEqual(DateOnly.MaxValue)
            .When(x => !x.Living)
            .WithMessage("A person who is not living must have a real death date.");
    }
}