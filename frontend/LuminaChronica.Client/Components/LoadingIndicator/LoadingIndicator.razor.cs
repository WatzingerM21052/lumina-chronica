using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

public partial class LoadingIndicator : ComponentBase
{
    [Parameter]
    public string? Text { get; set; }
}
