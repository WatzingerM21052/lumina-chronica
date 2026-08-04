using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class PdfReader : ComponentBase, IAsyncDisposable
{
    private const double MinZoom = 0.5;
    private const double MaxZoom = 2.5;
    private const double ZoomStep = 0.25;

    [Parameter, EditorRequired]
    public byte[] Bytes { get; set; } = [];

    [Parameter]
    public int InitialPage { get; set; } = 1;

    [Parameter]
    public string ReaderMode { get; set; } = "book";

    [Parameter]
    public string PageWidth { get; set; } = "normal";

    [Parameter]
    public string ScrollbarHide { get; set; } = "none";

    [Parameter]
    public EventCallback<PdfProgress> OnProgress { get; set; }

    // Realistic View can silently fail to initialize (a pre-existing pdf.js
    // worker instability, issue #213) and fall back to Book View entirely
    // inside pdfReader.js -- this is how that JS-side fallback tells the
    // parent to correct ReaderMode/persisted settings back to "book" too.
    // Without it, the Ansicht toggle kept showing Realistisch as active
    // while a single Book View page was what actually rendered -- reported
    // live as "only half the book is shown, shifted right", which is
    // exactly what a single narrow page looks like next to the two-page
    // spread the toggle claims should be there.
    [Parameter]
    public EventCallback OnRealisticUnavailable { get; set; }

    private readonly string _elementId = $"pdf-reader-{Guid.NewGuid():N}";
    private IJSObjectReference? _module;
    private DotNetObjectReference<PdfReader>? _dotNetRef;
    private int _currentPage = 1;
    private int _pageCount;
    private double _zoom = 1;
    private string _lastReaderMode = "";
    private string _lastPageWidth = "";
    private bool _readerModeChangedSinceRender;
    private bool _pageWidthChangedSinceRender;
    private bool _realisticPreparing;
    private ElementReference _viewportElement;

    private string ViewportClass
    {
        get
        {
            var classes = "pdf-reader-viewport";
            if (ReaderMode == "scroll")
            {
                classes += " pdf-reader-viewport--scroll";
                // Only meaningful in Scroll View -- this is the element with
                // overflow:auto (see .pdf-reader-viewport in app.css); Book/
                // Realistic View can also scroll it when zoomed, but the
                // preference is scoped to Scroll View specifically per the
                // source request.
                classes += ScrollbarHide switch
                {
                    "vertical" => " scrollbar-hide-vertical",
                    "horizontal" => " scrollbar-hide-horizontal",
                    "both" => " scrollbar-hide-both",
                    _ => "",
                };
            }
            classes += PageWidth switch { "narrow" => " pdf-reader-viewport--width-narrow", "wide" => " pdf-reader-viewport--width-wide", _ => "" };
            return classes;
        }
    }

    private string NavClass
    {
        get
        {
            var classes = "pdf-reader-nav";
            classes += PageWidth switch { "narrow" => " pdf-reader-nav--width-narrow", "wide" => " pdf-reader-nav--width-wide", _ => "" };
            return classes;
        }
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            _zoom = await ReaderSettings.GetPdfZoomAsync();

            _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/pdfReader.js");
            if (_module is null) return; // no JS runtime backing this call (e.g. bUnit's default Loose mode)

            _lastReaderMode = ReaderMode;
            _lastPageWidth = PageWidth;
            _dotNetRef = DotNetObjectReference.Create(this);

            _realisticPreparing = ReaderMode == "realistic";
            if (_realisticPreparing) StateHasChanged(); // shows the "wird vorbereitet" indicator before the long init() await below, not just after
            // _dotNetRef passed in directly (not left to the onScrolled() call
            // below) so it's registered before init() -- if ReaderMode starts
            // as "realistic" (a persisted setting, the common case), its
            // failure/fallback path runs inside this same call, and needs
            // OnRealisticViewUnavailable's target already wired up.
            _pageCount = await _module.InvokeAsync<int>("init", _elementId, Bytes, InitialPage, _zoom, ReaderMode, _dotNetRef);
            _realisticPreparing = false;
            _currentPage = await _module.InvokeAsync<int>("getCurrentPage", _elementId);
            // Scroll View's "current page" changes on scroll, not on a
            // discrete next()/prev()/goToPage() call -- registered
            // regardless of the initial mode so a later mode switch doesn't
            // also need to remember to register it.
            await _module.InvokeVoidAsync("onScrolled", _elementId, _dotNetRef);
            StateHasChanged();
            await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));

            // Arrow-key/spacebar page navigation (issue #144, point 2) needs
            // the viewport to actually hold keyboard focus -- it isn't
            // focusable by default (a plain div), hence tabindex="0" in the
            // markup, and needs an explicit focus call since nothing else on
            // the page would give it focus on its own.
            await _viewportElement.FocusAsync();
            return;
        }

        // Deferred from OnParametersSetAsync to here deliberately, same
        // reasoning as EpubReader's page-width/reader-mode handling: the
        // viewport's --scroll modifier class only takes effect once Blazor
        // has actually patched the DOM, and setFlow() needs the *new* CSS
        // in place before it measures the container.
        if (_readerModeChangedSinceRender && _module is not null)
        {
            _readerModeChangedSinceRender = false;
            _realisticPreparing = ReaderMode == "realistic";
            if (_realisticPreparing) StateHasChanged();
            await _module.InvokeVoidAsync("setFlow", _elementId, ReaderMode);
            _realisticPreparing = false;
            _currentPage = await _module.InvokeAsync<int>("getCurrentPage", _elementId);
            StateHasChanged();
        }
        else if (_pageWidthChangedSinceRender && _module is not null)
        {
            // Deferred here for the same reason as the reader-mode branch
            // above -- ViewportClass's width-narrow/wide modifier only
            // takes effect once Blazor has actually patched the DOM, and
            // resize() needs the *new* .pdf-reader-viewport size in place
            // before it measures the container to re-fit the canvas.
            // Without this, Seitenbreite only ever resized the empty
            // viewport around a canvas that was still rendered for the
            // *previous* width -- issue reported live: Schmal left a
            // too-wide canvas silently clipped by the frame's own
            // overflow:hidden instead of scaled down or scrollable.
            _pageWidthChangedSinceRender = false;
            await _module.InvokeVoidAsync("resize", _elementId);
        }
    }

    protected override void OnParametersSet()
    {
        if (_module is null) return;
        if (ReaderMode != _lastReaderMode)
        {
            _lastReaderMode = ReaderMode;
            _readerModeChangedSinceRender = true;
        }

        if (PageWidth != _lastPageWidth)
        {
            _lastPageWidth = PageWidth;
            _pageWidthChangedSinceRender = true;
        }
    }

    [JSInvokable]
    public async Task OnScrolled(int page, int pageCount)
    {
        _currentPage = page;
        _pageCount = pageCount;
        StateHasChanged();
        await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));
    }

    [JSInvokable]
    public async Task OnRealisticViewUnavailable()
    {
        // JS already tore itself down to Book View by the time this fires
        // (see pdfReader.js's initRealisticView catch block) -- this just
        // lets the parent correct ReaderMode/persisted settings to match,
        // so the Ansicht toggle stops claiming Realistisch is active.
        await OnRealisticUnavailable.InvokeAsync();
    }

    // Not scoped to the whole component -- @onkeydown lives on
    // .pdf-reader-viewport specifically, not .pdf-reader-nav, so keypresses
    // reaching the page-number <input> (a sibling, not a descendant) never
    // bubble into this handler and arrow keys keep their native
    // cursor-movement behavior there instead of hijacking page navigation.
    private Task HandleKeyDownAsync(KeyboardEventArgs e) => e.Key switch
    {
        "ArrowRight" or " " => NextAsync(),
        "ArrowLeft" => PrevAsync(),
        _ => Task.CompletedTask,
    };

    private async Task NextAsync()
    {
        if (_module is null) return;
        await _module.InvokeVoidAsync("next", _elementId);
        _currentPage = await _module.InvokeAsync<int>("getCurrentPage", _elementId);
        await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));
    }

    private async Task PrevAsync()
    {
        if (_module is null) return;
        await _module.InvokeVoidAsync("prev", _elementId);
        _currentPage = await _module.InvokeAsync<int>("getCurrentPage", _elementId);
        await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));
    }

    private async Task OnPageInputChangedAsync(ChangeEventArgs e)
    {
        if (_module is null) return;
        if (!int.TryParse(e.Value?.ToString(), out var requestedPage)) return;

        _currentPage = await _module.InvokeAsync<int>("goToPage", _elementId, requestedPage);
        await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));
    }

    private Task IncreaseZoomAsync() => SetZoomAsync(Math.Min(_zoom + ZoomStep, MaxZoom));

    private Task DecreaseZoomAsync() => SetZoomAsync(Math.Max(_zoom - ZoomStep, MinZoom));

    private Task ResetZoomAsync() => SetZoomAsync(1);

    private async Task SetZoomAsync(double zoom)
    {
        if (_module is null) return;
        _zoom = zoom;
        await _module.InvokeVoidAsync("setZoom", _elementId, _zoom);
        await ReaderSettings.SetPdfZoomAsync(_zoom);
    }

    public async ValueTask DisposeAsync()
    {
        if (_module is not null)
        {
            await _module.InvokeVoidAsync("destroy", _elementId);
            await _module.DisposeAsync();
        }
        _dotNetRef?.Dispose();
    }
}

public record PdfProgress(int Page, int PageCount);
