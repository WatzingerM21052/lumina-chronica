using System.Net.Http.Json;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Services;

// Thin wrapper around HttpClient for calls to the backend API.
// HttpClient.BaseAddress is configured in Program.cs from appsettings.json
// (ApiBaseUrl), so this class only knows about relative paths.
public class ApiClient(HttpClient httpClient)
{
    public async Task<ApiResponse<T>?> GetAsync<T>(string relativeUrl, CancellationToken cancellationToken = default)
    {
        try
        {
            return await httpClient.GetFromJsonAsync<ApiResponse<T>>(relativeUrl, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            return new ApiResponse<T>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            };
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
            return await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            return new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            };
        }
    }

    public async Task<ApiResponse<TResponse>?> PutAsync<TRequest, TResponse>(
        string relativeUrl, TRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.PutAsJsonAsync(relativeUrl, body, cancellationToken);
            return await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            return new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            };
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
            return await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            return new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            };
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
            return await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            return new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            };
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
