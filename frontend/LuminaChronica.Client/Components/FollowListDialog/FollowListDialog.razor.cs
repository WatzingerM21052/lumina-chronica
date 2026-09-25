using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

namespace LuminaChronica.Client.Components;

// Shows a public profile's followers or following list (profile backlog
// item raised 2026-09-25: the counts on /u/{username} were plain text, not
// clickable). One component handles both directions -- Kind picks the
// endpoint -- since the markup/paging/per-row-follow-toggle behavior is
// otherwise identical. Mirrors ConfirmDialog/AvatarUploadDialog's overlay/
// initial-focus/Escape-to-cancel conventions.
public partial class FollowListDialog : ComponentBase
{
    private const int PageSize = 20;

    [Parameter, EditorRequired]
    public bool IsOpen { get; set; }

    [Parameter, EditorRequired]
    public string Username { get; set; } = string.Empty;

    // "followers" or "following" -- selects the endpoint path segment.
    [Parameter, EditorRequired]
    public string Kind { get; set; } = string.Empty;

    [Parameter, EditorRequired]
    public string Title { get; set; } = string.Empty;

    [Parameter, EditorRequired]
    public string EmptyText { get; set; } = string.Empty;

    [Parameter, EditorRequired]
    public EventCallback OnClose { get; set; }

    [Inject]
    private ApiClient ApiClient { get; set; } = null!;

    private ElementReference _dialogElement;
    private bool _wasOpen;
    private List<FollowListItem>? _items;
    private int _total;
    private int _page;
    private bool _isLoading;
    private string? _togglingUsername;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (IsOpen && !_wasOpen)
        {
            await _dialogElement.FocusAsync();
            await LoadFirstPageAsync();
        }
        _wasOpen = IsOpen;
    }

    private async Task LoadFirstPageAsync()
    {
        _items = null;
        _page = 0;
        _total = 0;
        await LoadMoreAsync();
    }

    private async Task LoadMoreAsync()
    {
        _isLoading = true;
        StateHasChanged();

        var nextPage = _page + 1;
        var response = await ApiClient.GetAsync<FollowListResult>($"/api/users/{Username}/{Kind}?page={nextPage}&pageSize={PageSize}");

        if (response is { Success: true, Data: not null })
        {
            _items = [.. _items ?? [], .. response.Data.Items];
            _total = response.Data.Total;
            _page = nextPage;
        }
        else
        {
            _items ??= [];
        }

        _isLoading = false;
        StateHasChanged();
    }

    private async Task ToggleFollowAsync(FollowListItem item)
    {
        if (item.IsFollowing is null || _togglingUsername is not null) return;
        _togglingUsername = item.Username;

        var wasFollowing = item.IsFollowing.Value;
        var succeeded = wasFollowing
            ? await ApiClient.DeleteAsync($"/api/users/{item.Username}/follow")
            : await ApiClient.PostAsync($"/api/users/{item.Username}/follow");

        if (succeeded)
        {
            item.IsFollowing = !wasFollowing;
        }

        _togglingUsername = null;
    }

    private Task HandleKeyDownAsync(KeyboardEventArgs e) => e.Key == "Escape" ? OnClose.InvokeAsync() : Task.CompletedTask;
}
