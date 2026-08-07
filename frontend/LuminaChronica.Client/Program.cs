using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using LuminaChronica.Client;
using LuminaChronica.Client.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

var apiBaseUrl = builder.Configuration["ApiBaseUrl"]
    ?? throw new InvalidOperationException("ApiBaseUrl is not configured (wwwroot/appsettings.json).");

builder.Services.AddAuthorizationCore();
builder.Services.AddScoped<TokenStore>();
builder.Services.AddScoped<LuminaAuthStateProvider>();
builder.Services.AddScoped<AuthenticationStateProvider>(sp => sp.GetRequiredService<LuminaAuthStateProvider>());

builder.Services.AddTransient<AuthHeaderHandler>();
builder.Services
    .AddHttpClient("LuminaChronicaApi", client => client.BaseAddress = new Uri(apiBaseUrl))
    .AddHttpMessageHandler<AuthHeaderHandler>();
builder.Services.AddScoped(sp => sp.GetRequiredService<IHttpClientFactory>().CreateClient("LuminaChronicaApi"));

builder.Services.AddScoped<ApiClient>();
builder.Services.AddScoped<IThemeService, ThemeService>();
builder.Services.AddScoped<BlobUrlService>();
builder.Services.AddScoped<ElementMetricsService>();
builder.Services.AddScoped<ScrollTrackerService>();
builder.Services.AddScoped<TextPaginatorService>();
builder.Services.AddScoped<ReaderSettingsService>();
builder.Services.AddScoped<OfflineStorageService>();
builder.Services.AddScoped<BibleClientService>();
builder.Services.AddScoped<BibleAtmosphereService>();

await builder.Build().RunAsync();
