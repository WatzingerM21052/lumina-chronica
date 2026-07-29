namespace LuminaChronica.Client.Services;

public interface IThemeService
{
    Task<string> GetThemeAsync();

    Task SetThemeAsync(string theme);
}
