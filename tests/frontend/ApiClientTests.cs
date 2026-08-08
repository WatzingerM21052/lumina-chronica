using System.Net;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ApiClientTests
{
    // Regression: GetFromJsonAsync throws HttpRequestException on a
    // non-2xx status, and its .Message under Blazor WASM is .NET's raw,
    // unformatted resource-string text (e.g.
    // "net_http_message_not_success_statuscode_reason, 404, Not Found"),
    // not something fit to show a user. Caught live while wiring up
    // BookDetail's ErrorMessage/retry (issue #349 Phase B).
    [Fact]
    public async Task GetAsync_NotFoundStatus_ReturnsFriendlyMessage_NotRawExceptionText()
    {
        var handler = new StubHttpMessageHandler(new HttpResponseMessage(HttpStatusCode.NotFound));
        var apiClient = new ApiClient(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });

        var response = await apiClient.GetAsync<object>("/api/books/9999");

        Assert.False(response!.Success);
        Assert.Equal("Nicht gefunden.", response.Error!.Message);
        Assert.DoesNotContain("net_http_message", response.Error.Message);
    }

    [Fact]
    public async Task GetAsync_ServerError_ReturnsGenericFriendlyMessage()
    {
        var handler = new StubHttpMessageHandler(new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var apiClient = new ApiClient(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });

        var response = await apiClient.GetAsync<object>("/api/books/1");

        Assert.False(response!.Success);
        Assert.Equal("Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut.", response.Error!.Message);
    }

    private sealed class StubHttpMessageHandler(HttpResponseMessage response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(response);
    }
}
