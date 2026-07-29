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
}
