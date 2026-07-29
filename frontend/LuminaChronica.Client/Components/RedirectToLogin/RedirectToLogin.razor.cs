using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Rendered by App.razor's <AuthorizeRouteView> when an anonymous user hits
// an [Authorize] page -- Blazor WASM has no built-in equivalent to the
// hosted template's RedirectToLogin, so this is the minimal version.
public partial class RedirectToLogin : ComponentBase
{
    [Inject]
    public required NavigationManager NavigationManager { get; set; }

    protected override void OnInitialized()
    {
        NavigationManager.NavigateTo("/login");
    }
}
