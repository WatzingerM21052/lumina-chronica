using LuminaChronica.Client.Services;

namespace LuminaChronica.Client.Tests;

public class FakeThemeService(string theme = "classic-library") : IThemeService
{
    public string Theme { get; private set; } = theme;

    public Task<string> GetThemeAsync() => Task.FromResult(Theme);

    public Task SetThemeAsync(string theme)
    {
        Theme = theme;
        return Task.CompletedTask;
    }
}
