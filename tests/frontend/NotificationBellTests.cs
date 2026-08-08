using System.Linq;
using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// v3.3 Phase 3 (issue #326) -- bell icon + unread badge + filterable
// dropdown list, rendered in MainLayout's <Authorized> block (not covered
// here -- no MainLayoutTests.cs exists, so this tests the component in
// isolation, same approach as MultiSelectDropdownTests.cs).
public class NotificationBellTests : BunitContext
{
    private const string TwoNotificationsJson = """
        {"success":true,"data":{"unreadCount":1,"notifications":[
            {"id":2,"type":"COMMENT","actorUserId":5,"actorUsername":"bob","targetType":"BOOK","targetId":7,"readAt":null,"createdAt":"2026-08-08 10:00:00"},
            {"id":1,"type":"FOLLOW","actorUserId":6,"actorUsername":"carol","targetType":"USER","targetId":6,"readAt":"2026-08-07 09:00:00","createdAt":"2026-08-07 09:00:00"}
        ]}}
        """;

    private const string EmptyNotificationsJson = """{"success":true,"data":{"unreadCount":0,"notifications":[]}}""";

    private RoutedFakeHttpMessageHandler UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        return handler;
    }

    [Fact]
    public void NotificationBell_ShowsUnreadBadgeCount()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/notifications", TwoNotificationsJson));

        var cut = Render<NotificationBell>();

        Assert.Contains("1", cut.Find(".notification-badge").TextContent);
    }

    [Fact]
    public void NotificationBell_NoBadge_WhenUnreadCountIsZero()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/notifications", EmptyNotificationsJson));

        var cut = Render<NotificationBell>();

        Assert.Empty(cut.FindAll(".notification-badge"));
    }

    [Fact]
    public void NotificationBell_TogglingOpen_ListsNotificationsWithText()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/notifications", TwoNotificationsJson));

        var cut = Render<NotificationBell>();
        cut.Find(".notification-bell-toggle").Click();

        Assert.Contains("bob hat kommentiert", cut.Markup);
        Assert.Contains("carol folgt dir jetzt", cut.Markup);
    }

    [Fact]
    public void NotificationBell_FilterPill_NarrowsListToSelectedType()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/notifications", TwoNotificationsJson));

        var cut = Render<NotificationBell>();
        cut.Find(".notification-bell-toggle").Click();
        cut.FindAll(".notification-pill").Single(p => p.TextContent.Trim() == "Follower").Click();

        Assert.DoesNotContain("bob hat kommentiert", cut.Markup);
        Assert.Contains("carol folgt dir jetzt", cut.Markup);
    }

    [Fact]
    public void NotificationBell_ClickingUnreadNotification_SendsReadRequestAndDecrementsBadge()
    {
        HttpRequestMessage? readRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath.EndsWith("/read"), r =>
            {
                readRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true}""");
            })
            .WhenPathEndsWith("/notifications", TwoNotificationsJson);
        UseHandler(handler);

        var cut = Render<NotificationBell>();
        cut.Find(".notification-bell-toggle").Click();
        cut.Find(".notification-item.is-unread .notification-link").Click();

        Assert.NotNull(readRequest);
        Assert.EndsWith("/notifications/2/read", readRequest!.RequestUri!.AbsolutePath);
        Assert.Empty(cut.FindAll(".notification-badge"));
    }

    [Fact]
    public void NotificationBell_MarkAllRead_SendsReadAllRequestAndClearsBadge()
    {
        HttpRequestMessage? readAllRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath.EndsWith("/read-all"), r =>
            {
                readAllRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true}""");
            })
            .WhenPathEndsWith("/notifications", TwoNotificationsJson);
        UseHandler(handler);

        var cut = Render<NotificationBell>();
        cut.Find(".notification-bell-toggle").Click();
        cut.Find(".notification-mark-all").Click();

        Assert.NotNull(readAllRequest);
        Assert.Empty(cut.FindAll(".notification-badge"));
    }
}
