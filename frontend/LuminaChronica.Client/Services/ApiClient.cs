using System.Net.Http.Json;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Services;

// Thin wrapper around HttpClient for calls to the backend API.
// HttpClient.BaseAddress is configured in Program.cs from appsettings.json
// (ApiBaseUrl), so this class only knows about relative paths.
//
// With i18n (always, via DI) every error message is turned into the UI
// language's text by ApiErrorText; the code stays as the backend sent it.
public class ApiClient(HttpClient httpClient, II18nService? i18n = null)
{
    private ApiResponse<T>? Localized<T>(ApiResponse<T>? response)
    {
        if (i18n is not null) ApiErrorText.Localize(response?.Error, i18n);
        return response;
    }

    public async Task<ApiResponse<T>?> GetAsync<T>(string relativeUrl, CancellationToken cancellationToken = default)
    {
        try
        {
            return Localized(await httpClient.GetFromJsonAsync<ApiResponse<T>>(relativeUrl, cancellationToken));
        }
        catch (HttpRequestException ex)
        {
            // Not ex.Message -- GetFromJsonAsync throws with .NET's raw,
            // unformatted resource-string message on a non-2xx status
            // under Blazor WASM (e.g. literally
            // "net_http_message_not_success_statuscode_reason, 404, Not
            // Found"), which then surfaced verbatim to end users wherever
            // a caller showed Error.Message (issue #349 Phase B --
            // caught live while wiring up BookDetail's ErrorMessage/retry
            // for exactly this failure path). A friendly message per
            // status code, or a generic fallback, replaces it.
            var (code, message) = ex.StatusCode switch
            {
                System.Net.HttpStatusCode.NotFound => ("NOT_FOUND", "Nicht gefunden."),
                System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden => ("FORBIDDEN", "Keine Berechtigung."),
                _ => ("NETWORK_ERROR", "Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut."),
            };
            return Localized(new ApiResponse<T>
            {
                Success = false,
                Error = new ApiError { Code = code, Message = message }
            });
        }
    }

    // Unlike GetFromJsonAsync, these don't throw on a non-2xx status -- the
    // backend puts a real error envelope (e.g. EMAIL_TAKEN) in 4xx bodies
    // too, and callers need that, not just a generic failure.
    public async Task<ApiResponse<TResponse>?> PostAsync<TRequest, TResponse>(
        string relativeUrl, TRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.PostAsJsonAsync(relativeUrl, body, cancellationToken);
            return Localized(await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken));
        }
        catch (HttpRequestException ex)
        {
            return Localized(new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            });
        }
    }

    public async Task<ApiResponse<TResponse>?> PutAsync<TRequest, TResponse>(
        string relativeUrl, TRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.PutAsJsonAsync(relativeUrl, body, cancellationToken);
            return Localized(await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken));
        }
        catch (HttpRequestException ex)
        {
            return Localized(new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            });
        }
    }

    // For a DELETE with a JSON body where both outcomes carry a real
    // ApiResponse envelope (e.g. account deletion's wrong-password case) --
    // mirrors PutAsync<TRequest,TResponse> exactly, just with HttpMethod.Delete
    // via SendAsync since HttpClient has no DeleteAsJsonAsync helper.
    public async Task<ApiResponse<TResponse>?> DeleteAsync<TRequest, TResponse>(
        string relativeUrl, TRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Delete, relativeUrl) { Content = JsonContent.Create(body) };
            var response = await httpClient.SendAsync(request, cancellationToken);
            return Localized(await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken));
        }
        catch (HttpRequestException ex)
        {
            return Localized(new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            });
        }
    }

    // For endpoints with no request body and no response envelope to parse
    // (e.g. logout's 204 No Content).
    public async Task<bool> PostAsync(string relativeUrl, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.PostAsync(relativeUrl, content: null, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    // For endpoints with a JSON request body but no response envelope to
    // parse (e.g. rating a book -- 204 No Content on success). Mirrors the
    // bodyless PostAsync/DeleteAsync's bool-return shape, just with a body.
    public async Task<bool> PutAsync<TRequest>(string relativeUrl, TRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.PutAsJsonAsync(relativeUrl, body, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    // Same shape as PutAsync<TRequest> above, for a POST with a JSON body
    // and no response envelope to parse (e.g. sharing a book with a user --
    // 204 No Content on success).
    public async Task<bool> PostAsync<TRequest>(string relativeUrl, TRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.PostAsJsonAsync(relativeUrl, body, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    // For book upload -- a multipart/form-data body (metadata fields + the
    // book file + an optional cover), not JSON.
    public async Task<ApiResponse<TResponse>?> PostMultipartAsync<TResponse>(
        string relativeUrl, MultipartFormDataContent content, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.PostAsync(relativeUrl, content, cancellationToken);
            return Localized(await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken));
        }
        catch (HttpRequestException ex)
        {
            return Localized(new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            });
        }
    }

    // For cover replacement -- a multipart/form-data body against an
    // existing resource, mirroring PostMultipartAsync's shape but for PUT.
    public async Task<ApiResponse<TResponse>?> PutMultipartAsync<TResponse>(
        string relativeUrl, MultipartFormDataContent content, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.PutAsync(relativeUrl, content, cancellationToken);
            return Localized(await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken));
        }
        catch (HttpRequestException ex)
        {
            return Localized(new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            });
        }
    }

    public async Task<bool> DeleteAsync(string relativeUrl, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.DeleteAsync(relativeUrl, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    // For authenticated binary fetches (book covers/files) -- HttpClient
    // attaches the bearer token via AuthHeaderHandler like any other call,
    // which a bare <img src="..."> can't do. Content-Type is returned
    // alongside the bytes since the caller needs it to build an accurate
    // Blob (see BlobUrlService).
    public async Task<(byte[] Bytes, string ContentType)?> GetBytesAsync(string relativeUrl, CancellationToken cancellationToken = default)
    {
        // "Coverbilder anzeigen" off: no cover is downloaded at all.
        if (!CoverPreferences.ShowImages && CoverPreferences.IsBookCover(relativeUrl)) return null;

        try
        {
            var response = await httpClient.GetAsync(relativeUrl, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            var contentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
            return (bytes, contentType);
        }
        catch (HttpRequestException)
        {
            return null;
        }
    }
}
