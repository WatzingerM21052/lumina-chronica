using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// v3.3 Phase 3 (issue #326) -- per-type notification preference toggles,
// added below the pre-existing theme picker.
public class SettingsPageTests : BunitContext
{
    private class FakeThemeService : IThemeService
    {
        public string Theme = "classic-library";
        public Task<string> GetThemeAsync() => Task.FromResult(Theme);
        public Task SetThemeAsync(string theme) { Theme = theme; return Task.CompletedTask; }
    }

    private const string AllEnabledPreferencesJson = """{"success":true,"data":{"FOLLOW":true,"COMMENT":true,"RATING":true,"SHARE":true,"ACTIVITY_RATING":true}}""";

    private RoutedFakeHttpMessageHandler UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<IThemeService>(new FakeThemeService());
        return handler;
    }

    [Fact]
    public void Settings_RendersAllFivePreferenceRowsCheckedByDefault()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));

        var cut = Render<Settings>();

        var checkboxes = cut.FindAll(".notification-preference-row input[type=checkbox]");
        Assert.Equal(5, checkboxes.Count);
        Assert.All(checkboxes, cb => Assert.True(cb.HasAttribute("checked")));
        Assert.Contains("Neuer Follower", cut.Markup);
        Assert.Contains("Eigene Bewertungen im Aktivitäten-Log", cut.Markup);
    }

    [Fact]
    public void Settings_RendersDisabledPreferenceAsUnchecked()
    {
        const string json = """{"success":true,"data":{"FOLLOW":true,"COMMENT":false,"RATING":true,"SHARE":true,"ACTIVITY_RATING":true}}""";
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", json));

        var cut = Render<Settings>();

        var commentRow = cut.FindAll(".notification-preference-row")[1];
        Assert.False(commentRow.QuerySelector("input")!.HasAttribute("checked"));
    }

    [Fact]
    public void Settings_TogglingCheckbox_SendsPutWithTypeAndEnabled()
    {
        HttpRequestMessage? putRequest = null;
        string? putBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                putBody = r.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true}""");
            })
            .WhenPathEndsWith("/preferences", AllEnabledPreferencesJson);
        UseHandler(handler);

        var cut = Render<Settings>();
        cut.FindAll(".notification-preference-row input[type=checkbox]")[0].Change(false);

        Assert.NotNull(putRequest);
        Assert.EndsWith("/preferences", putRequest!.RequestUri!.AbsolutePath);
        Assert.Contains("\"FOLLOW\"", putBody);
        Assert.Contains("\"enabled\":false", putBody);
    }
}
