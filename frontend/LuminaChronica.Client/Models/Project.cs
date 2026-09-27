using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/projectService.ts's ProjectSummary.
public class Project
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = "WORLD";

    [JsonPropertyName("coverUrl")]
    public string? CoverUrl { get; set; }

    [JsonPropertyName("mapUrl")]
    public string? MapUrl { get; set; }

    [JsonPropertyName("visibility")]
    public string Visibility { get; set; } = "PRIVATE";

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
}

public class UpdateProjectRequest
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("visibility")]
    public string? Visibility { get; set; }
}

// Community Phase 1 (issue #300) -- the frontend only ever offers these two;
// SHARED is stored/accepted by the backend but has no enforcement semantics
// yet, so it isn't a real choice for a user to make.
public static class VisibilityOption
{
    public static readonly IReadOnlyList<string> Options = ["PRIVATE", "PUBLIC"];

    // i18n optional (defaults to the original hardcoded German), same
    // reasoning as ProjectTypeLabel.For above.
    public static string For(string visibility, Services.II18nService? i18n = null) => visibility switch
    {
        "PRIVATE" => i18n?.T("visibility.private") ?? "Privat",
        "PUBLIC" => i18n?.T("visibility.public") ?? "Öffentlich",
        _ => visibility,
    };
}

// type is cosmetic/label only (backend/src/services/projectService.ts) --
// every project gets the same feature set regardless. This just maps the
// enum to a German display label for the UI.
public static class ProjectTypeLabel
{
    public static readonly IReadOnlyList<string> Options = ["WORLD", "NOVEL", "RPG", "CUSTOM"];

    // i18n optional (defaults to the original hardcoded German) so callers
    // across different pages/batches can be migrated to I18n.T() one at a
    // time without this helper's other, not-yet-migrated call sites breaking.
    public static string For(string type, Services.II18nService? i18n = null) => type switch
    {
        "WORLD" => i18n?.T("projectType.world") ?? "Welt",
        "NOVEL" => i18n?.T("projectType.novel") ?? "Roman",
        "RPG" => i18n?.T("projectType.rpg") ?? "Pen & Paper",
        "CUSTOM" => i18n?.T("projectType.custom") ?? "Individuell",
        _ => type,
    };
}
