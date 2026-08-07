using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/characterRelationshipService.ts's
// CharacterRelationshipSummary. Directional by convention: relationshipType
// is phrased from character A to character B (e.g. "Mentor von").
public class CharacterRelationship
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("projectId")]
    public int ProjectId { get; set; }

    [JsonPropertyName("characterAId")]
    public int CharacterAId { get; set; }

    [JsonPropertyName("characterAName")]
    public string CharacterAName { get; set; } = string.Empty;

    [JsonPropertyName("characterBId")]
    public int CharacterBId { get; set; }

    [JsonPropertyName("characterBName")]
    public string CharacterBName { get; set; } = string.Empty;

    [JsonPropertyName("relationshipType")]
    public string RelationshipType { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
}

public class CreateCharacterRelationshipRequest
{
    [JsonPropertyName("characterAId")]
    public int CharacterAId { get; set; }

    [JsonPropertyName("characterBId")]
    public int CharacterBId { get; set; }

    [JsonPropertyName("relationshipType")]
    public string RelationshipType { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

public class UpdateCharacterRelationshipRequest
{
    [JsonPropertyName("relationshipType")]
    public string? RelationshipType { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
