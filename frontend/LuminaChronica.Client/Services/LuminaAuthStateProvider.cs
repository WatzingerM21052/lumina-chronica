using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Components.Authorization;

namespace LuminaChronica.Client.Services;

// Custom AuthenticationStateProvider backed by the JWT in localStorage (via
// TokenStore). The token's signature was already verified by the backend;
// this only decodes the payload client-side to populate the ClaimsPrincipal
// (sub/role) so <AuthorizeView>/[Authorize] work.
public class LuminaAuthStateProvider(TokenStore tokenStore) : AuthenticationStateProvider
{
    private static readonly AuthenticationState Anonymous = new(new ClaimsPrincipal(new ClaimsIdentity()));

    public override async Task<AuthenticationState> GetAuthenticationStateAsync()
    {
        var token = await tokenStore.GetTokenAsync();
        if (string.IsNullOrEmpty(token))
        {
            return Anonymous;
        }

        var principal = ParsePrincipal(token);
        return principal is null ? Anonymous : new AuthenticationState(principal);
    }

    public async Task MarkUserAsAuthenticatedAsync(string token)
    {
        await tokenStore.SetTokenAsync(token);
        var principal = ParsePrincipal(token);
        NotifyAuthenticationStateChanged(Task.FromResult(principal is null ? Anonymous : new AuthenticationState(principal)));
    }

    public async Task MarkUserAsLoggedOutAsync()
    {
        await tokenStore.ClearTokenAsync();
        NotifyAuthenticationStateChanged(Task.FromResult(Anonymous));
    }

    private static ClaimsPrincipal? ParsePrincipal(string token)
    {
        var parts = token.Split('.');
        if (parts.Length != 3)
        {
            return null;
        }

        JwtPayload? payload;
        try
        {
            var json = Encoding.UTF8.GetString(Base64UrlDecode(parts[1]));
            payload = JsonSerializer.Deserialize<JwtPayload>(json);
        }
        catch (FormatException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }

        if (payload is null || payload.Exp < DateTimeOffset.UtcNow.ToUnixTimeSeconds())
        {
            return null;
        }

        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, payload.Sub.ToString()), new Claim(ClaimTypes.Role, payload.Role)],
            authenticationType: "jwt");
        return new ClaimsPrincipal(identity);
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - (padded.Length % 4)) % 4);
        return Convert.FromBase64String(padded);
    }

    private class JwtPayload
    {
        public int Sub { get; set; }
        public string Role { get; set; } = string.Empty;
        public long Exp { get; set; }
    }
}
