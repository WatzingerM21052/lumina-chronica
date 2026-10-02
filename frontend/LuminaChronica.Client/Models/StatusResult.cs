using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

public class StatusResult
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    // Features the running backend has (review §3.3, GET /api/status), so a
    // newer frontend can hide what an older backend doesn't serve yet.
    [JsonPropertyName("capabilities")]
    public List<string> Capabilities { get; set; } = [];
}
