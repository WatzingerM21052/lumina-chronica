using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

public class RegisterRequest
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;

    [JsonPropertyName("confirmNewAccount")]
    public bool? ConfirmNewAccount { get; set; }
}

public class LoginRequest
{
    [JsonPropertyName("identifier")]
    public string Identifier { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}

// Mirrors backend/src/services/authService.ts's AuthResult.
public class AuthResult
{
    [JsonPropertyName("token")]
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("userId")]
    public int UserId { get; set; }
}

// Issue #40 (OAuth). Posted to /api/auth/oauth/exchange by OAuthCallback.razor
// with the short-lived, single-use code the backend redirected back with.
public class OAuthExchangeRequest
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;
}

// Mirrors backend/src/services/userService.ts's UserProfile.
public class UserProfile
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("avatarUrl")]
    public string? AvatarUrl { get; set; }

    [JsonPropertyName("roleName")]
    public string RoleName { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
}

public class UpdateProfileRequest
{
    [JsonPropertyName("username")]
    public string? Username { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("currentPassword")]
    public string? CurrentPassword { get; set; }

    [JsonPropertyName("newPassword")]
    public string? NewPassword { get; set; }
}

// Posted to DELETE /api/users/me. CurrentPassword is required by the
// backend for accounts with a real password, and ignored for OAuth-only
// accounts -- see backend/src/services/userService.ts's deleteUser.
public class DeleteAccountRequest
{
    [JsonPropertyName("currentPassword")]
    public string? CurrentPassword { get; set; }
}

// Posted to POST /api/auth/restore, shown after a 409 DELETED_ACCOUNT_FOUND
// from /api/auth/register.
public class RestoreAccountRequest
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}

// Mirrors backend/src/services/oauthService.ts's LinkedProvider.
public class LinkedOAuthProvider
{
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("linkedAt")]
    public string LinkedAt { get; set; } = string.Empty;
}

// Returned by GET /api/auth/oauth/:provider/link/start.
public class OAuthLinkStartResult
{
    [JsonPropertyName("redirectUrl")]
    public string RedirectUrl { get; set; } = string.Empty;
}
