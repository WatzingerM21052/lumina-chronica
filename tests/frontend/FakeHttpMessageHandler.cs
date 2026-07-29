using System.Net;
using System.Text;

namespace LuminaChronica.Client.Tests;

// Minimal fake handler so tests don't hit a real network — returns a canned
// success envelope for any request.
public class FakeHttpMessageHandler(string responseJson) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(responseJson, Encoding.UTF8, "application/json")
        };
        return Task.FromResult(response);
    }
}
