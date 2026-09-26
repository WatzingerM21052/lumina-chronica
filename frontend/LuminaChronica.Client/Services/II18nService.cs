namespace LuminaChronica.Client.Services;

public interface II18nService
{
    string CurrentLanguage { get; }

    Task InitializeAsync();

    string T(string key);

    Task SetLanguageAsync(string language);
}
