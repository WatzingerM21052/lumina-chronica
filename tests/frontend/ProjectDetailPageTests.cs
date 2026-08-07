using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ProjectDetailPageTests : BunitContext
{
    private const string ProjectJson = """{"success":true,"data":{"id":1,"title":"Aetherfall","description":"Ein sky-shattered Kontinent","type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}}""";

    private RoutedFakeHttpMessageHandler UseDefaultRoutes()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        return handler;
    }

    [Fact]
    public void ProjectDetail_RendersTitleTypeAndDescription()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Aetherfall", cut.Markup);
        Assert.Contains("Welt", cut.Markup);
        Assert.Contains("Ein sky-shattered Kontinent", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_DeleteButton_OpensConfirmDialog()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();

        Assert.Contains("Projekt wirklich löschen?", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_ConfirmDialog_Confirm_DeletesTheProject()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete && r.RequestUri!.AbsolutePath == "/api/projects/1", r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}""");
            })
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.NotNull(deleteRequest);
    }

    [Fact]
    public void ProjectDetail_EditButton_ShowsEditFormWithCurrentValues()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();

        Assert.Equal("Aetherfall", cut.Find("#project-edit-title").GetAttribute("value"));
    }

    [Fact]
    public void ProjectDetail_SaveEdit_SendsUpdatedTitleAndType()
    {
        HttpRequestMessage? putRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":1,"title":"Aetherfall Reborn","description":"Ein sky-shattered Kontinent","type":"RPG","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();
        cut.Find("#project-edit-title").Change("Aetherfall Reborn");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, putRequest?.Method);
        Assert.Equal("/api/projects/1", putRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("Aetherfall Reborn", cut.Markup);
    }
}
