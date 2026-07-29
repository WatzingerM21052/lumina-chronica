using System.Net;
using System.Net.Http.Headers;

namespace LuminaChronica.Client.Services;

// Attaches the stored bearer token to every outgoing request; on a 401
// response, flips the auth state to logged-out (the token is invalid or
// expired) rather than making every page handle that itself.
public class AuthHeaderHandler(TokenStore tokenStore, LuminaAuthStateProvider authStateProvider) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var token = await tokenStore.GetTokenAsync();
        if (!string.IsNullOrEmpty(token))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        var response = await base.SendAsync(request, cancellationToken);

        if (response.StatusCode == HttpStatusCode.Unauthorized && !string.IsNullOrEmpty(token))
        {
            await authStateProvider.MarkUserAsLoggedOutAsync();
        }

        return response;
    }
}
