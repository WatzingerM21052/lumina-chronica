using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors the backend's standard response envelope (Technical Standards §2).
public class ApiResponse<T>
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("data")]
    public T? Data { get; set; }

    [JsonPropertyName("error")]
    public ApiError? Error { get; set; }
}

public class ApiError
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    // RATE_LIMITED only: the wait the backend asked for, read before the
    // message is localized (ApiErrorText) -- callers format their own copy.
    [JsonIgnore]
    public int? RetryAfterSeconds { get; set; }
}
