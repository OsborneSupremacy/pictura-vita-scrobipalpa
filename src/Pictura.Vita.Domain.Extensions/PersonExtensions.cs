namespace Pictura.Vita.Domain.Extensions;

public static class PersonExtensions
{
    extension(Person person)
    {
        public string GetFullName() =>
            !person.NameParts.Any() ? "Anonymous" : string.Join(" ", person.NameParts).Trim();

        public string GetFullNamePossessive()
        {
            var fullName = person.GetFullName();
            return fullName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? $"{fullName}'" : $"{fullName}'s";
        }
    }
}