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
}
