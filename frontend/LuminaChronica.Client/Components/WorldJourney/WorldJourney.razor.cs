using System.Globalization;
using System.Text.Json;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

// The immersive Home for the Babylon and Alexandria themes (user request
// 2026-10-03, prototype "Lumina Dashboard Reise"): the dashboard as one
// journey in chapters -- continue reading, the yearly goal as a rosette /
// astrolabe ring, the reading calendar as a sky of stars, the library, the
// newest project and a finale with the ways on. Settings can switch it off
// for the calmer card dashboard (WorldDashboard). All numbers and positions
// are worked out here, so the markup stays plain and testable; journey.js
// only adds motion and the hover cards.
public partial class WorldJourney : IAsyncDisposable
{
    [Inject] private ApiClient ApiClient { get; set; } = null!;
    [Inject] private BlobUrlService BlobUrlService { get; set; } = null!;
    [Inject] private II18nService I18n { get; set; } = null!;
    [Inject] private IJSRuntime JsRuntime { get; set; } = null!;

    // "babylon" or "alexandria".
    [Parameter, EditorRequired] public string World { get; set; } = "babylon";
    [Parameter] public DashboardResponse? Dashboard { get; set; }
    [Parameter] public List<Book>? Books { get; set; }
    [Parameter] public int TotalBooks { get; set; }
    [Parameter] public List<Project>? Projects { get; set; }
    [Parameter] public ReadingGoal? Goal { get; set; }
    [Parameter] public IReadOnlyList<CalendarDay> CalendarDays { get; set; } = [];
    // Page count of the featured book (the dashboard list carries none).
    [Parameter] public int? FeaturedPages { get; set; }

    public const int SkyWeeks = 34;
    private const int ShelfBooks = 3;

    private ElementReference _rootRef;
    private IJSObjectReference? _module;
    private IJSObjectReference? _handle;

    // Cover pictures by book id / the project's, as blob URLs.
    private readonly Dictionary<int, string> _covers = [];
    private string? _projectCover;
    private ProjectFacts? _facts;
    private TimelineEvent? _lastEvent;

    private bool IsBabylon => World == "babylon";
    private ContinueReadingItem? Featured => Dashboard?.ContinueReading.FirstOrDefault();
    private IEnumerable<ContinueReadingItem> AlsoOpen => Dashboard?.ContinueReading.Skip(1).Take(2) ?? [];
    private Project? CurrentProject => Projects?.FirstOrDefault();
    private IEnumerable<Book> ShelfSelection => (Books ?? []).Take(ShelfBooks);

    private static string F(double value, string format = "0.##") => value.ToString(format, CultureInfo.InvariantCulture);
    private static int Percent(double value) => (int)Math.Round(Math.Clamp(value, 0, 100));

    protected override async Task OnParametersSetAsync()
    {
        BuildSky();
        var covers = new List<Task>();
        if (Featured is { Book.CoverUrl: not null } featured) covers.Add(LoadCoverAsync(featured.Book));
        foreach (var book in ShelfSelection.Where(b => b.CoverUrl is not null)) covers.Add(LoadCoverAsync(book));
        await Task.WhenAll(covers);
        if (CurrentProject is { } project && _facts is null)
        {
            await LoadProjectAsync(project);
        }
    }

    private async Task LoadCoverAsync(Book book)
    {
        if (_covers.ContainsKey(book.Id) || book.CoverUrl is null) return;
        var result = await ApiClient.GetBytesAsync(book.CoverUrl);
        if (result is { } cover && !_covers.ContainsKey(book.Id))
        {
            _covers[book.Id] = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
        }
    }

    private string? CoverOf(Book book) => _covers.TryGetValue(book.Id, out var url) ? url : null;

    // The project chapter's numbers and its latest timeline entry.
    private async Task LoadProjectAsync(Project project)
    {
        var basePath = $"/api/projects/{project.Id}";
        var coverTask = project.CoverUrl is not null ? ApiClient.GetBytesAsync(project.CoverUrl) : Task.FromResult<(byte[], string)?>(null);
        var characters = ApiClient.GetAsync<List<JsonElement>>($"{basePath}/characters");
        var locations = ApiClient.GetAsync<List<JsonElement>>($"{basePath}/locations");
        var timeline = ApiClient.GetAsync<List<TimelineEvent>>($"{basePath}/timeline");
        var lore = ApiClient.GetAsync<List<JsonElement>>($"{basePath}/lore");
        var books = ApiClient.GetAsync<List<JsonElement>>($"{basePath}/books");
        var files = ApiClient.GetAsync<List<JsonElement>>($"{basePath}/files");

        static int CountOf<T>(ApiResponse<List<T>>? r) => r is { Success: true, Data: not null } ? r.Data.Count : 0;
        var events = await timeline;
        _facts = new ProjectFacts(CountOf(await characters), CountOf(await locations), CountOf(events), CountOf(await lore), CountOf(await books), CountOf(await files));
        _lastEvent = events is { Success: true, Data: { Count: > 0 } list } ? list.MaxBy(e => e.Id) : null;

        if (await coverTask is { } cover)
        {
            _projectCover = await BlobUrlService.CreateObjectUrlAsync(cover.Item1, cover.Item2);
        }
    }

    private record ProjectFacts(int Characters, int Locations, int Events, int Lore, int Books, int Files);

    // ---------- II · Weiterlesen ----------

    private int? CurrentPage(ContinueReadingItem item) =>
        FeaturedPages is { } pages and > 0 ? Math.Max(1, (int)Math.Round(Math.Clamp(item.Percentage, 0, 100) / 100 * pages)) : null;

    private static string ReadHref(ContinueReadingItem item) => $"library/books/{item.Book.Id}/read";

    // ---------- III · Jahresziel ----------

    // Fields are drawn as rosette petals (Babylon, up to 24) or as segments
    // of a ring around the astrolabe (Alexandria, or more than 24 books).
    private const int MaxPetals = 24;

    private int GoalTarget => Goal?.TargetBooks is { } t and > 0 ? t : 0;
    private int GoalDone => Math.Min(Goal?.BooksFinishedThisYear ?? 0, GoalTarget);
    private bool UsePetals => IsBabylon && GoalTarget <= MaxPetals;

    private string GoalHeading()
    {
        var done = GoalDone;
        var key = done == 0 ? "0" : done >= GoalTarget ? "Full" : done == 1 ? "One" : "Many";
        var prefix = IsBabylon ? "journey.goalHeadingBabylon" : "journey.goalHeadingAlexandria";
        return string.Format(CultureInfo.InvariantCulture, I18n.T(prefix + key), done);
    }

    private string GoalLeftText()
    {
        var left = Math.Max(0, GoalTarget - (Goal?.BooksFinishedThisYear ?? 0));
        return left == 0 ? I18n.T("home.goalReached") : string.Format(CultureInfo.InvariantCulture, I18n.T(left == 1 ? "home.goalLeftOne" : "home.goalLeft"), left);
    }

    // "Noch 7 Bücher bis Silvester. Bei deinem bisherigen Tempo …"
    private string GoalBodyText()
    {
        var left = GoalLeftText();
        if (!left.EndsWith('.') && !left.EndsWith('!')) left += ".";
        return GoalPaceText() is { } pace ? $"{left} {pace}" : left;
    }

    // "Bei deinem bisherigen Tempo werden es bis Silvester etwa 14 Bücher."
    // Only once there is something to project from.
    private string? GoalPaceText()
    {
        var finished = Goal?.BooksFinishedThisYear ?? 0;
        var today = DateTime.UtcNow;
        if (finished == 0 || today.DayOfYear < 14) return null;
        var daysInYear = DateTime.IsLeapYear(today.Year) ? 366 : 365;
        var projected = (int)Math.Round(finished * (double)daysInYear / today.DayOfYear);
        if (projected <= finished) return null;
        return string.Format(CultureInfo.InvariantCulture, I18n.T("journey.goalPace"), projected);
    }

    private record GoalField(int Index, string Path, bool Lit, string Title, string Main, string? Note);

    private IEnumerable<GoalField> GoalFields()
    {
        var n = GoalTarget;
        if (n == 0) yield break;
        var next = Featured is { Percentage: < 100 } f ? f : null;
        for (var i = 0; i < n; i++)
        {
            var title = string.Format(CultureInfo.InvariantCulture, I18n.T("journey.goalField"), i + 1, n);
            string main;
            string? note = null;
            if (i < GoalDone)
            {
                main = I18n.T("journey.goalFieldRead");
            }
            else if (i == GoalDone && next is not null)
            {
                main = string.Format(CultureInfo.InvariantCulture, I18n.T("journey.goalFieldNext"), next.Book.Title);
                note = string.Format(CultureInfo.InvariantCulture, I18n.T("journey.goalFieldProgress"), Percent(next.Percentage));
            }
            else
            {
                main = I18n.T("journey.goalFieldOpen");
            }
            yield return new GoalField(i, UsePetals ? PetalPath(i, n) : SegmentPath(i, n), i < GoalDone, title, main, note);
        }
    }

    // A petal pointing up, turned to its place; slimmer the more there are.
    private static string PetalPath(int i, int n)
    {
        var w = 34 * Math.Clamp(12.0 / n, 0.55, 1.25);
        var angle = i * 360.0 / n;
        return $"rotate({F(angle)}) |M0 -40 C {F(w)} -80, {F(w * 0.88)} -170, 0 -212 C {F(-w * 0.88)} -170, {F(-w)} -80, 0 -40 Z";
    }

    private static string SegmentPath(int i, int n)
    {
        var gap = n > 36 ? 0.6 : 2.0;
        double Rad(double deg) => deg * Math.PI / 180;
        var a0 = Rad(i * 360.0 / n - 90 + gap);
        var a1 = Rad((i + 1) * 360.0 / n - 90 - gap);
        const double r1 = 214, r2 = 236;
        var large = (a1 - a0) > Math.PI ? 1 : 0;
        return $"|M{F(Math.Cos(a0) * r2)} {F(Math.Sin(a0) * r2)} A{F(r2)} {F(r2)} 0 {large} 1 {F(Math.Cos(a1) * r2)} {F(Math.Sin(a1) * r2)} " +
               $"L{F(Math.Cos(a1) * r1)} {F(Math.Sin(a1) * r1)} A{F(r1)} {F(r1)} 0 {large} 0 {F(Math.Cos(a0) * r1)} {F(Math.Sin(a0) * r1)} Z";
    }

    private static (string Transform, string D) SplitPath(string path)
    {
        var bar = path.IndexOf('|');
        return (path[..bar], path[(bar + 1)..]);
    }

    private IEnumerable<(string X, string Y, string Label)> DialMonths()
    {
        var months = I18n.T("statistics.monthsShort").Split(',');
        if (months.Length != 12) yield break;
        for (var i = 0; i < 12; i++)
        {
            var a = i / 12.0 * Math.PI * 2 - Math.PI / 2 + Math.PI / 12;
            yield return (F(Math.Cos(a) * 262), F(Math.Sin(a) * 262), months[i]);
        }
    }

    // ---------- IV · Lesehimmel ----------

    private record Star(string X, string Y, int Level, bool Best, string Title, string Main, string? Text, string Aria, int Week, int Weekday, bool Read);
    private record StarLine(string X1, string Y1, string X2, string Y2);

    private List<Star> _stars = [];
    private List<StarLine> _lines = [];
    private List<(string X, string Y, string Label)> _skyMonths = [];
    private List<(string X, string Y, string Label)> _skyWeekdays = [];
    private List<string> _lanes = [];
    private int _skyPages;
    private int _skyReadDays;
    private int _skyStreak;
    private int _skyPerDay;

    private const double SkyX0 = 110, SkyX1 = 1550, SkyY0 = 170, SkyRow = 62, SkyArc = 110;

    private static (double X, double Y) SkyPos(int week, int weekday)
    {
        var t = week / (double)(SkyWeeks - 1);
        // A small, fixed jitter per day so the band reads as stars, not a grid.
        var j = Math.Abs(Math.Sin(week * 12.9898 + weekday * 78.233) * 43758.5453) % 1 * 9;
        return (SkyX0 + t * (SkyX1 - SkyX0) + j, SkyY0 + weekday * SkyRow - Math.Sin(Math.PI * t) * SkyArc + j * 0.6);
    }

    // Same scale as the reading calendar: pages per day 1-20, 21-40, 41-60,
    // over 60; days without a page count fall back to the relative level.
    private static int Level(CalendarDay? day, int maxCount)
    {
        if (day is null || day.Count == 0) return 0;
        if (day.Pages is { } pages and > 0) return pages switch { <= 20 => 1, <= 40 => 2, <= 60 => 3, _ => 4 };
        return Math.Clamp((int)Math.Ceiling(day.Count * 4.0 / Math.Max(1, maxCount)), 1, 4);
    }

    private void BuildSky()
    {
        var byDate = CalendarDays.GroupBy(d => d.Date).ToDictionary(g => g.Key, g => g.First());
        var maxCount = byDate.Count > 0 ? byDate.Values.Max(d => d.Count) : 0;
        var today = DateTime.UtcNow.Date;
        var thisMonday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var start = thisMonday.AddDays(-7 * (SkyWeeks - 1));
        var weekdays = I18n.T("statistics.weekdaysShort").Split(',');
        var monthsLong = I18n.T("statistics.monthsLong").Split(',');

        var stars = new List<Star>();
        var months = new List<(string, string, string)>();
        var lastMonth = -1;
        var bestPages = 0;
        string? bestKey = null;
        foreach (var (key, day) in byDate)
        {
            if (day.Pages is { } p && p > bestPages && DateTime.TryParse(key, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) && d >= start && d <= today)
            {
                bestPages = p;
                bestKey = key;
            }
        }

        for (var w = 0; w < SkyWeeks; w++)
        {
            for (var wd = 0; wd < 7; wd++)
            {
                var date = start.AddDays(w * 7 + wd);
                if (date > today) continue;
                // A month is named above the week holding its 1st (and the
                // month the range starts in above the first week).
                if (wd == 0 && monthsLong.Length == 12)
                {
                    var holdsFirst = Enumerable.Range(0, 7).Select(o => date.AddDays(o)).Where(x => x.Day == 1 && x <= today).ToList();
                    var month = holdsFirst.Count > 0 ? holdsFirst[0].Month : w == 0 ? date.Month : -1;
                    if (month > 0 && month != lastMonth)
                    {
                        lastMonth = month;
                        var (mx, my) = SkyPos(w, 0);
                        months.Add((F(mx, "0.#"), F(my - 34, "0.#"), monthsLong[month - 1]));
                    }
                }

                var key = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                var day = byDate.GetValueOrDefault(key);
                var level = Level(day, maxCount);
                var weekday = weekdays.Length == 7 ? weekdays[wd] : "";
                var monthName = monthsLong.Length == 12 ? monthsLong[date.Month - 1] : date.Month.ToString(CultureInfo.InvariantCulture);
                var dateLabel = string.Format(CultureInfo.InvariantCulture, I18n.T("statistics.calendarDayLabel"), weekday, date.Day, monthName, date.Year);
                string main;
                if (day is null || day.Count == 0) main = I18n.T("statistics.calendarNotRead");
                else if (day.Pages is { } pages && pages > 0) main = string.Format(CultureInfo.InvariantCulture, I18n.T(pages == 1 ? "statistics.calendarPage" : "statistics.calendarPages"), pages);
                else main = I18n.T("statistics.calendarRead");
                var books = day is { Books.Count: > 0 } ? string.Join(" · ", day.Books) : null;
                var best = key == bestKey;
                var (x, y) = SkyPos(w, wd);
                stars.Add(new Star(F(x, "0.#"), F(y, "0.#"), level, best, dateLabel, main, books, books is null ? $"{dateLabel}: {main}" : $"{dateLabel}: {main}, {books}", w, wd, level > 0));
            }
        }

        // Constellations: reading days next to each other in the same week.
        var lines = new List<StarLine>();
        for (var i = 1; i < stars.Count; i++)
        {
            var a = stars[i - 1];
            var b = stars[i];
            if (a.Read && b.Read && a.Week == b.Week) lines.Add(new StarLine(a.X, a.Y, b.X, b.Y));
        }

        var lanes = new List<string>();
        for (var wd = 0; wd < 7; wd++)
        {
            lanes.Add("M" + string.Join(" L", Enumerable.Range(0, SkyWeeks).Select(w => { var (x, y) = SkyPos(w, wd); return $"{F(x, "0.#")} {F(y, "0.#")}"; })));
        }

        var shownWeekdays = new List<(string, string, string)>();
        if (weekdays.Length == 7)
        {
            foreach (var wd in new[] { 0, 2, 4, 6 })
            {
                var (x, y) = SkyPos(0, wd);
                shownWeekdays.Add((F(x - 72, "0.#"), F(y + 4, "0.#"), weekdays[wd]));
            }
        }

        // Facts over the shown range.
        var shownDays = byDate.Where(kv => DateTime.TryParse(kv.Key, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) && d >= start && d <= today).Select(kv => kv.Value).ToList();
        _skyPages = shownDays.Sum(d => d.Pages ?? 0);
        _skyReadDays = shownDays.Count(d => d.Count > 0);
        var withPages = shownDays.Where(d => d.Pages is > 0).ToList();
        _skyPerDay = withPages.Count > 0 ? (int)Math.Round(withPages.Average(d => d.Pages!.Value)) : 0;
        var run = 0;
        _skyStreak = 0;
        foreach (var s in stars)
        {
            run = s.Read ? run + 1 : 0;
            _skyStreak = Math.Max(_skyStreak, run);
        }

        _stars = stars;
        _lines = lines;
        _skyMonths = months;
        _skyWeekdays = shownWeekdays;
        _lanes = lanes;
    }

    private static readonly double[] StarRadius = [1.6, 2.6, 3.6, 4.8, 6];

    // A gold clockwork medallion on books without a cover.
    private static readonly RenderFragment Ornament = builder =>
    {
        builder.AddMarkupContent(0,
            "<svg class=\"journey-book-ornament\" viewBox=\"0 0 100 100\" fill=\"none\" stroke=\"#e8c97a\" stroke-width=\"1.1\" aria-hidden=\"true\">" +
            "<circle cx=\"50\" cy=\"50\" r=\"30\"/><circle cx=\"50\" cy=\"50\" r=\"22\" stroke-dasharray=\"2 3\"/>" +
            string.Concat(Enumerable.Range(0, 24).Select(i =>
            {
                var a = i / 24.0 * Math.PI * 2;
                return $"<line x1=\"{F(50 + Math.Cos(a) * 30)}\" y1=\"{F(50 + Math.Sin(a) * 30)}\" x2=\"{F(50 + Math.Cos(a) * 35)}\" y2=\"{F(50 + Math.Sin(a) * 35)}\"/>";
            })) +
            "<path d=\"M50 50 L50 30 M50 50 L64 58\" stroke-width=\"2\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"50\" r=\"2.5\" fill=\"#e8c97a\"/></svg>");
    };

    // ---------- Library and finale ----------

    private string LibraryDoorText() =>
        string.Format(CultureInfo.InvariantCulture, I18n.T("journey.doorLibrary"), Dashboard?.Overview.TotalBooks ?? TotalBooks, Dashboard?.Overview.FinishedBooks ?? 0);

    private string ProjectsDoorText() => Projects is { Count: > 0 } p
        ? string.Format(CultureInfo.InvariantCulture, I18n.T(p.Count == 1 ? "journey.doorProjectsOne" : "journey.doorProjects"), p.Count)
        : I18n.T("journey.doorProjectsNone");

    // ---------- Lifecycle ----------

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;
        try
        {
            _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/journey.js");
            _handle = await _module.InvokeAsync<IJSObjectReference>("start", _rootRef);
        }
        catch (Exception)
        {
            // Progressive enhancement: the journey reads fine standing still.
        }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (_module is not null && _handle is not null) await _module.InvokeVoidAsync("stop", _handle);
            if (_handle is not null) await _handle.DisposeAsync();
            if (_module is not null) await _module.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
        }
        foreach (var url in _covers.Values.Append(_projectCover).OfType<string>())
        {
            _ = BlobUrlService.RevokeObjectUrlAsync(url);
        }
    }
}
