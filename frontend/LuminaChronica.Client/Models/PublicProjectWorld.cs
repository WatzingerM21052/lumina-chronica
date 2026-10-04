using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// GET /api/projects/{id}/public: a PUBLIC project's world, read-only. Files
// and the map are never part of it.
public class PublicProjectWorld
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("title")] public string Title { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("type")] public string Type { get; set; } = "WORLD";
    [JsonPropertyName("coverUrl")] public string? CoverUrl { get; set; }
    [JsonPropertyName("ownerUsername")] public string OwnerUsername { get; set; } = string.Empty;
    [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = string.Empty;
    [JsonPropertyName("characters")] public List<PublicCharacter> Characters { get; set; } = [];
    [JsonPropertyName("relationships")] public List<PublicRelationship> Relationships { get; set; } = [];
    [JsonPropertyName("locations")] public List<PublicLocation> Locations { get; set; } = [];
    [JsonPropertyName("timeline")] public List<PublicTimelineEvent> Timeline { get; set; } = [];
    [JsonPropertyName("lore")] public List<PublicLoreEntry> Lore { get; set; } = [];
    [JsonPropertyName("books")] public List<PublicLinkedBook> Books { get; set; } = [];
}

public class PublicCharacter
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("age")] public string? Age { get; set; }
    [JsonPropertyName("origin")] public string? Origin { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("personality")] public string? Personality { get; set; }
    [JsonPropertyName("biography")] public string? Biography { get; set; }
    [JsonPropertyName("imageUrl")] public string? ImageUrl { get; set; }
}

public class PublicRelationship
{
    [JsonPropertyName("characterAId")] public int CharacterAId { get; set; }
    [JsonPropertyName("characterBId")] public int CharacterBId { get; set; }
    [JsonPropertyName("relationshipType")] public string RelationshipType { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string? Description { get; set; }
}

public class PublicLocation
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("imageUrl")] public string? ImageUrl { get; set; }
}

public class PublicTimelineEvent
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("title")] public string Title { get; set; } = string.Empty;
    [JsonPropertyName("date")] public string? Date { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
}

public class PublicLoreEntry
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("title")] public string Title { get; set; } = string.Empty;
    [JsonPropertyName("content")] public string Content { get; set; } = string.Empty;
}

public class PublicLinkedBook
{
    [JsonPropertyName("id")] public int Id { get; set; }
    [JsonPropertyName("title")] public string Title { get; set; } = string.Empty;
    [JsonPropertyName("author")] public string? Author { get; set; }
    [JsonPropertyName("coverUrl")] public string? CoverUrl { get; set; }
}
