namespace LuminaChronica.Client.Components;

// Placeholder text for a card without an image (design audit F4): the
// initials of the name ("Elarion" -> "E", "Das Silbertal" -> "DS") read as
// "this one" at a glance, where the same grey icon on every card did not.
public static class CardInitials
{
    public static string Of(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "?";

        var words = name.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var letters = words
            .Select(w => w.EnumerateRunes().FirstOrDefault(r => System.Text.Rune.IsLetterOrDigit(r)))
            .Where(r => r.Value != 0)
            .Take(2)
            .Select(r => r.ToString().ToUpperInvariant());

        var initials = string.Concat(letters);
        return initials.Length > 0 ? initials : "?";
    }
}
