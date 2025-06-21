namespace Pictura.Vita.Domain.Extensions;

public static class PersonExtensions
{
    public static string GetFullName(this Person person) =>
        !person.NameParts.Any() ? "Anonymous" : string.Join(" ", person.NameParts);

    public static string GetFullNamePossessive(this Person person)
    {
        var fullName = person.GetFullName();
        return fullName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? $"{fullName}'" : $"{fullName}'s";
    }
}