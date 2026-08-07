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
}

// type is cosmetic/label only (backend/src/services/projectService.ts) --
// every project gets the same feature set regardless. This just maps the
// enum to a German display label for the UI.
public static class ProjectTypeLabel
{
    public static readonly IReadOnlyList<string> Options = ["WORLD", "NOVEL", "RPG", "CUSTOM"];

    public static string For(string type) => type switch
    {
        "WORLD" => "Welt",
        "NOVEL" => "Roman",
        "RPG" => "Pen & Paper",
        "CUSTOM" => "Individuell",
        _ => type,
    };
}
