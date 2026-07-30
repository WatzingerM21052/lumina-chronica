using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

public partial class MultiSelectDropdown : ComponentBase
{
    [Parameter, EditorRequired]
    public string Label { get; set; } = string.Empty;

    [Parameter, EditorRequired]
    public IReadOnlyList<string> Options { get; set; } = [];

    [Parameter]
    public IReadOnlyList<string> SelectedValues { get; set; } = [];

    [Parameter]
    public EventCallback<IReadOnlyList<string>> SelectedValuesChanged { get; set; }

    private bool _isOpen;

    private void ToggleOpen() => _isOpen = !_isOpen;

    private async Task ToggleOptionAsync(string option)
    {
        var next = SelectedValues.Contains(option)
            ? SelectedValues.Where(v => v != option).ToList()
            : [.. SelectedValues, option];

        await SelectedValuesChanged.InvokeAsync(next);
    }
}
