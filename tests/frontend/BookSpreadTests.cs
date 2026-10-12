using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class BookSpreadTests : BunitContext
{
    public BookSpreadTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton(new HttpClient(new FakeHttpMessageHandler("{}")) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
    }

    [Fact]
    public async Task Opening_ShowsTheSpread_WithTheWaysOn()
    {
        var cut = Render<BookSpread>();
        Assert.Empty(cut.FindAll(".book-spread"));

        await cut.InvokeAsync(() => cut.Instance.OpenAsync(new Book { Id = 4, Title = "Momo", Author = "Michael Ende", Genre = "Fantasy", Description = "Die Zeitdiebe." }, 62, new BookSpreadSource("classic-Genre-Fantasy-4")));

        Assert.Equal("dialog", cut.Find(".book-spread").GetAttribute("role"));
        Assert.Equal("Momo", cut.Find("#book-spread-title").TextContent);
        Assert.Contains("Die Zeitdiebe.", cut.Markup);
        Assert.Contains("62 % gelesen", cut.Markup);
        var actions = cut.FindAll(".book-spread-action");
        Assert.Equal("library/books/4/read", actions[0].GetAttribute("href"));
        Assert.Equal("Weiterlesen", actions[0].TextContent);
        Assert.Equal("library/books/4", actions[1].GetAttribute("href"));
    }

    [Fact]
    public async Task EscapeOrTheCloseButton_PutsTheBookBack()
    {
        var closed = 0;
        var cut = Render<BookSpread>(p => p.Add(x => x.OnClosed, () => closed++));
        await cut.InvokeAsync(() => cut.Instance.OpenAsync(new Book { Id = 1, Title = "Faust" }, null, new BookSpreadSource("k")));
        Assert.Equal("Lesen", cut.Find(".book-spread-action").TextContent);

        cut.Find(".book-spread").KeyDown(new KeyboardEventArgs { Key = "Escape" });
        Assert.Empty(cut.FindAll(".book-spread"));

        await cut.InvokeAsync(() => cut.Instance.OpenAsync(new Book { Id = 1, Title = "Faust" }, null, new BookSpreadSource("k")));
        cut.Find(".book-spread-close").Click();
        Assert.Empty(cut.FindAll(".book-spread"));
        Assert.Equal(2, closed);
    }
}
