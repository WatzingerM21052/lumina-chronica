using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class SearchInputTests : BunitContext
{
    public SearchInputTests() => Services.AddSingleton<II18nService, FakeI18nService>();

    [Fact]
    public void Empty_HasNoClearButton_AndUsesThePlaceholderAsLabel()
    {
        var cut = Render<SearchInput>(p => p.Add(x => x.Placeholder, "Bücher suchen"));

        Assert.Empty(cut.FindAll(".search-input-clear"));
        Assert.Equal("Bücher suchen", cut.Find("input[type=search]").GetAttribute("aria-label"));
    }

    [Fact]
    public void Typing_ForwardsTheValueToOnInput()
    {
        string? received = null;
        var cut = Render<SearchInput>(p => p
            .Add(x => x.OnInput, (ChangeEventArgs e) => received = e.Value?.ToString()));

        cut.Find("input").Input("Nebel");

        Assert.Equal("Nebel", received);
    }

    [Fact]
    public void Clear_SendsAnEmptyValueThroughOnInput()
    {
        string? received = null;
        var cut = Render<SearchInput>(p => p
            .Add(x => x.Value, "Nebel")
            .Add(x => x.OnInput, (ChangeEventArgs e) => received = e.Value?.ToString()));

        Assert.Equal("Suche leeren", cut.Find(".search-input-clear").GetAttribute("title"));
        cut.Find(".search-input-clear").Click();

        Assert.Equal(string.Empty, received);
    }
}
