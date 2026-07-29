using System.Net;
using System.Net.Http.Headers;
using System.Text;

namespace LuminaChronica.Client.Tests;

// Unlike FakeHttpMessageHandler (same canned response for every request),
// this routes by request URL/method -- needed once a page makes more than
// one distinct API call (e.g. Reader.razor: book metadata + progress + raw
// file bytes, three different shapes).
public class RoutedFakeHttpMessageHandler : HttpMessageHandler
{
    private readonly List<(Func<HttpRequestMessage, bool> Match, Func<HttpRequestMessage, HttpResponseMessage> Respond)> _routes = [];

    public RoutedFakeHttpMessageHandler When(Func<HttpRequestMessage, bool> match, Func<HttpRequestMessage, HttpResponseMessage> respond)
    {
        _routes.Add((match, respond));
        return this;
    }

    public RoutedFakeHttpMessageHandler WhenPathEndsWith(string suffix, string responseJson) =>
        When(r => r.RequestUri!.AbsolutePath.EndsWith(suffix), _ => JsonResponse(responseJson));

    public RoutedFakeHttpMessageHandler WhenPathEndsWith(string suffix, string content, string contentType) =>
        When(r => r.RequestUri!.AbsolutePath.EndsWith(suffix), _ => BytesResponse(content, contentType));

    public static HttpResponseMessage JsonResponse(string json) =>
        new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    public static HttpResponseMessage BytesResponse(string content, string contentType)
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(content, Encoding.UTF8) };
        response.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return response;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var route = _routes.FirstOrDefault(r => r.Match(request));
        if (route.Respond is null)
        {
            throw new InvalidOperationException($"No route configured for {request.Method} {request.RequestUri}");
        }
        return Task.FromResult(route.Respond(request));
    }
}
