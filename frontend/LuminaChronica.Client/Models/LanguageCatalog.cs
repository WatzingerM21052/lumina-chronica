namespace LuminaChronica.Client.Models;

// Book languages (UI/UX plan A2). A book's language is stored as the
// ISO 639-1 code when it was picked from this list ("de"), and as the typed
// text otherwise ("Plattdeutsch") -- the column stays free text, so values
// saved before the picker existed ("Deutsch", "en-US", "ger") remain valid
// and are shown by name where they can be recognized.
//
// A fixed table rather than the browser's Intl.DisplayNames: synchronous
// (no JS interop in render paths), identical in bUnit and every browser,
// and independent of which ICU data Blazor happened to load.
public static class LanguageCatalog
{
    public sealed record Language(string Code, string German, string English)
    {
        public string Name(string uiLanguage) => uiLanguage == "en" ? English : German;
    }

    // Common book languages first would bias the list; alphabetical by the
    // UI-language name is applied at display time instead (see Ordered).
    public static readonly IReadOnlyList<Language> All =
    [
        new("af", "Afrikaans", "Afrikaans"),
        new("sq", "Albanisch", "Albanian"),
        new("ar", "Arabisch", "Arabic"),
        new("hy", "Armenisch", "Armenian"),
        new("az", "Aserbaidschanisch", "Azerbaijani"),
        new("eu", "Baskisch", "Basque"),
        new("be", "Belarussisch", "Belarusian"),
        new("bn", "Bengalisch", "Bengali"),
        new("bs", "Bosnisch", "Bosnian"),
        new("br", "Bretonisch", "Breton"),
        new("bg", "Bulgarisch", "Bulgarian"),
        new("zh", "Chinesisch", "Chinese"),
        new("da", "Dänisch", "Danish"),
        new("de", "Deutsch", "German"),
        new("en", "Englisch", "English"),
        new("eo", "Esperanto", "Esperanto"),
        new("et", "Estnisch", "Estonian"),
        new("fo", "Färöisch", "Faroese"),
        new("fi", "Finnisch", "Finnish"),
        new("fr", "Französisch", "French"),
        new("fy", "Friesisch", "Western Frisian"),
        new("gl", "Galicisch", "Galician"),
        new("ka", "Georgisch", "Georgian"),
        new("el", "Griechisch", "Greek"),
        new("he", "Hebräisch", "Hebrew"),
        new("hi", "Hindi", "Hindi"),
        new("id", "Indonesisch", "Indonesian"),
        new("ga", "Irisch", "Irish"),
        new("is", "Isländisch", "Icelandic"),
        new("it", "Italienisch", "Italian"),
        new("ja", "Japanisch", "Japanese"),
        new("yi", "Jiddisch", "Yiddish"),
        new("kk", "Kasachisch", "Kazakh"),
        new("ca", "Katalanisch", "Catalan"),
        new("ko", "Koreanisch", "Korean"),
        new("co", "Korsisch", "Corsican"),
        new("hr", "Kroatisch", "Croatian"),
        new("ku", "Kurdisch", "Kurdish"),
        new("la", "Latein", "Latin"),
        new("lv", "Lettisch", "Latvian"),
        new("lt", "Litauisch", "Lithuanian"),
        new("lb", "Luxemburgisch", "Luxembourgish"),
        new("ms", "Malaiisch", "Malay"),
        new("mt", "Maltesisch", "Maltese"),
        new("mk", "Mazedonisch", "Macedonian"),
        new("mn", "Mongolisch", "Mongolian"),
        new("ne", "Nepali", "Nepali"),
        new("nl", "Niederländisch", "Dutch"),
        new("no", "Norwegisch", "Norwegian"),
        new("fa", "Persisch", "Persian"),
        new("pl", "Polnisch", "Polish"),
        new("pt", "Portugiesisch", "Portuguese"),
        new("pa", "Punjabi", "Punjabi"),
        new("rm", "Rätoromanisch", "Romansh"),
        new("ro", "Rumänisch", "Romanian"),
        new("ru", "Russisch", "Russian"),
        new("sa", "Sanskrit", "Sanskrit"),
        new("gd", "Schottisch-Gälisch", "Scottish Gaelic"),
        new("sv", "Schwedisch", "Swedish"),
        new("sr", "Serbisch", "Serbian"),
        new("sk", "Slowakisch", "Slovak"),
        new("sl", "Slowenisch", "Slovenian"),
        new("es", "Spanisch", "Spanish"),
        new("sw", "Swahili", "Swahili"),
        new("tl", "Tagalog", "Tagalog"),
        new("ta", "Tamil", "Tamil"),
        new("th", "Thailändisch", "Thai"),
        new("cs", "Tschechisch", "Czech"),
        new("tr", "Türkisch", "Turkish"),
        new("uk", "Ukrainisch", "Ukrainian"),
        new("hu", "Ungarisch", "Hungarian"),
        new("ur", "Urdu", "Urdu"),
        new("uz", "Usbekisch", "Uzbek"),
        new("vi", "Vietnamesisch", "Vietnamese"),
        new("cy", "Walisisch", "Welsh"),
    ];

    private static readonly Dictionary<string, Language> ByCode = All.ToDictionary(l => l.Code, StringComparer.OrdinalIgnoreCase);

    // ISO 639-2 (bibliographic and terminology) codes that EPUB/PDF metadata
    // and older entries commonly carry, mapped onto the 639-1 entry.
    private static readonly Dictionary<string, string> Alpha3 = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ger"] = "de", ["deu"] = "de", ["eng"] = "en", ["fre"] = "fr", ["fra"] = "fr",
        ["spa"] = "es", ["ita"] = "it", ["por"] = "pt", ["dut"] = "nl", ["nld"] = "nl",
        ["rus"] = "ru", ["pol"] = "pl", ["cze"] = "cs", ["ces"] = "cs", ["swe"] = "sv",
        ["dan"] = "da", ["nor"] = "no", ["nob"] = "no", ["nno"] = "no", ["fin"] = "fi",
        ["gre"] = "el", ["ell"] = "el", ["tur"] = "tr", ["jpn"] = "ja", ["chi"] = "zh",
        ["zho"] = "zh", ["kor"] = "ko", ["ara"] = "ar", ["heb"] = "he", ["hun"] = "hu",
        ["lat"] = "la", ["ukr"] = "uk", ["rum"] = "ro", ["ron"] = "ro", ["hrv"] = "hr",
        ["srp"] = "sr", ["slo"] = "sk", ["slk"] = "sk", ["slv"] = "sl", ["bul"] = "bg",
        ["ice"] = "is", ["isl"] = "is", ["gle"] = "ga", ["wel"] = "cy", ["cym"] = "cy",
        ["cat"] = "ca", ["baq"] = "eu", ["eus"] = "eu", ["epo"] = "eo", ["hin"] = "hi",
        ["per"] = "fa", ["fas"] = "fa", ["vie"] = "vi", ["tha"] = "th", ["ind"] = "id",
    };

    // Returns the catalog entry a stored value stands for, or null when it's
    // a custom language (or empty). Recognizes 639-1 codes, region-tagged
    // codes ("en-US", "pt_BR"), 639-2 codes, and the German/English name.
    public static Language? Find(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();

        if (ByCode.TryGetValue(trimmed, out var direct)) return direct;
        if (Alpha3.TryGetValue(trimmed, out var alpha2)) return ByCode[alpha2];

        var dash = trimmed.IndexOfAny(['-', '_']);
        if (dash is 2 or 3)
        {
            var baseCode = trimmed[..dash];
            if (ByCode.TryGetValue(baseCode, out var regional)) return regional;
            if (Alpha3.TryGetValue(baseCode, out var regionalAlpha2)) return ByCode[regionalAlpha2];
        }

        return All.FirstOrDefault(l =>
            string.Equals(l.German, trimmed, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(l.English, trimmed, StringComparison.OrdinalIgnoreCase));
    }

    // What to show for a stored value: the language's name in the UI
    // language when recognized, otherwise the value as typed.
    public static string? DisplayName(string? value, string uiLanguage) =>
        string.IsNullOrWhiteSpace(value) ? null : Find(value)?.Name(uiLanguage) ?? value.Trim();

    // What to store for extracted metadata (EPUB dc:language etc.): the
    // 639-1 code when recognized, otherwise the raw value.
    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : Find(value)?.Code ?? value.Trim();

    public static IEnumerable<Language> Ordered(string uiLanguage) =>
        All.OrderBy(l => l.Name(uiLanguage), StringComparer.Create(System.Globalization.CultureInfo.InvariantCulture, ignoreCase: true));

    // Search-as-you-type: prefix matches on either name or the code rank
    // before substring matches, so "de" lists Deutsch before "Schwedisch".
    public static IReadOnlyList<Language> Search(string? query, string uiLanguage)
    {
        var ordered = Ordered(uiLanguage);
        if (string.IsNullOrWhiteSpace(query)) return ordered.ToList();

        var q = query.Trim();
        bool Prefix(Language l) =>
            l.Name(uiLanguage).StartsWith(q, StringComparison.OrdinalIgnoreCase) ||
            l.German.StartsWith(q, StringComparison.OrdinalIgnoreCase) ||
            l.English.StartsWith(q, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(l.Code, q, StringComparison.OrdinalIgnoreCase);
        bool Contains(Language l) =>
            l.German.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            l.English.Contains(q, StringComparison.OrdinalIgnoreCase);

        var prefix = ordered.Where(Prefix).ToList();
        return [.. prefix, .. ordered.Where(l => !prefix.Contains(l) && Contains(l))];
    }
}
