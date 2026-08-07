using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ProjectsPageTests : BunitContext
{
    private void UseApiResponse(string responseJson)
    {
        var handler = new FakeHttpMessageHandler(responseJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
    }

    [Fact]
    public void Projects_ShowsEmptyState_WhenNoProjectsExist()
    {
        UseApiResponse("""{"success":true,"data":[]}""");

        var cut = Render<Projects>();

        Assert.Contains("Du hast noch keine Projekte erstellt", cut.Markup);
    }

    [Fact]
    public void Projects_RendersProjectCardsFromApiResponse()
    {
        UseApiResponse("""
            {"success":true,"data":[
                {"id":1,"title":"Aetherfall","description":null,"type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"},
                {"id":2,"title":"Chronicle of Ash","description":null,"type":"NOVEL","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-02"}
            ]}
            """);

        var cut = Render<Projects>();

        Assert.Contains("Aetherfall", cut.Markup);
        Assert.Contains("Chronicle of Ash", cut.Markup);
        Assert.Equal(2, cut.FindAll("a.project-card").Count);
    }

    [Fact]
    public void Projects_CreateForm_SubmitsTitleAndReloadsList()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                createRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":1,"title":"Neues Projekt","description":null,"type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}}""");
            })
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Projects>();
        cut.Find("button.btn-primary").Click(); // "Projekt erstellen" toggles the create form
        cut.Find("#project-title").Change("Neues Projekt");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Post, createRequest?.Method);
        Assert.Equal("/api/projects", createRequest?.RequestUri?.AbsolutePath);
    }
}
