using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

public class StatusResult
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}
