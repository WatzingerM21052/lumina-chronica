using Bunit;
using Bunit.TestDoubles;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class PublicProfilePageTests : BunitContext
{
    // <AuthorizeView> (Community Phase 2, issue #304) needs bUnit's
    // authorization test-double wiring, not just a plain
    // AuthenticationStateProvider -- AddAuthorization() registers a
    // BunitAuthorizationContext + CascadingAuthenticationState in the render
    // tree; SetAuthorized/SetNotAuthorized then drive its state.
    private void SetAuthenticated(bool authenticated, string username = "")
    {
        var authContext = AddAuthorization();
        if (authenticated)
        {
            authContext.SetAuthorized(username, AuthorizationState.Authorized);
        }
        else
        {
            authContext.SetNotAuthorized();
        }
    }

    private const string ProfileWithContentJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[{"id":1,"title":"Public Book","author":"Jane Doe","description":null,"coverUrl":null,"genre":null,"language":null,"averageRating":null,"ratingCount":0,"myRating":null}],"projects":[{"id":2,"title":"Public World","description":null,"type":"WORLD","coverUrl":null}]}}""";

    private const string UnratedBookProfileJson =
        """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[{"id":9,"title":"Unrated Book","author":null,"description":null,"coverUrl":null,"genre":null,"language":null,"averageRating":null,"ratingCount":0,"myRating":null}],"projects":[]}}""";

    private const string RatedBookProfileJson =
        """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[{"id":9,"title":"Rated Book","author":null,"description":null,"coverUrl":null,"genre":null,"language":null,"averageRating":4.5,"ratingCount":2,"myRating":3}],"projects":[]}}""";

    private const string OwnRatedBookProfileJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":true,"books":[{"id":9,"title":"My Own Book","author":null,"description":null,"coverUrl":null,"genre":null,"language":null,"averageRating":4.5,"ratingCount":2,"myRating":null}],"projects":[]}}""";

    // "Borrowed reading" (follow-up to #300) -- a SHARED book skips the
    // rating widget entirely (ratings stay PUBLIC-only) and shows a "Lesen"
    // button when canRead is true (v3.2, issue #321 -- share-list
    // membership is invisible to the frontend, so it's keyed off this
    // computed field, not raw visibility) or a "Privat geteilt" message
    // otherwise.
    private const string SharedBookReadableProfileJson =
        """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[{"id":9,"title":"Shared Book","author":null,"description":null,"coverUrl":null,"genre":null,"language":null,"visibility":"SHARED","canRead":true,"averageRating":null,"ratingCount":0,"myRating":null}],"projects":[]}}""";

    private const string SharedBookNotReadableProfileJson =
        """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[{"id":9,"title":"Shared Book","author":null,"description":null,"coverUrl":null,"genre":null,"language":null,"visibility":"SHARED","canRead":false,"averageRating":null,"ratingCount":0,"myRating":null}],"projects":[]}}""";

    private const string EmptyProfileJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[],"projects":[]}}""";

    // v3.3 Phase 1 (issue #324) -- profile activity log. createdAt
    // deliberately uses D1's real "yyyy-MM-dd HH:mm:ss" shape (SQLite's
    // CURRENT_TIMESTAMP format -- no 'T', no offset), not ISO-8601 --
    // production returns exactly this, and ProfileActivity.CreatedAt is
    // string (parsed explicitly at render time), not DateTime, specifically
    // because System.Text.Json's default DateTime converter rejects this
    // format outright. Caught live in the browser against the real API,
    // not by the test suite -- this fixture exists so it would be next time.
    private const string ProfileWithActivitiesJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[],"projects":[],"activities":[{"id":1,"type":"RATING_GIVEN","targetType":"BOOK","targetId":9,"targetTitle":"Dune","rating":4,"createdAt":"2026-08-01 00:00:00"},{"id":2,"type":"BOOK_PUBLIC","targetType":"BOOK","targetId":10,"targetTitle":"Mittelerde","rating":null,"createdAt":"2026-07-28 00:00:00"},{"id":3,"type":"PROJECT_PUBLIC","targetType":"PROJECT","targetId":11,"targetTitle":"Aetherfall","rating":null,"createdAt":"2026-07-20 00:00:00"}]}}""";

    private const string NotFollowingProfileJson =
        """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":3,"followingCount":1,"isFollowing":false,"isOwnProfile":false,"books":[],"projects":[]}}""";

    private const string FollowingProfileJson =
        """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":4,"followingCount":1,"isFollowing":true,"isOwnProfile":false,"books":[],"projects":[]}}""";

    private const string OwnProfileJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":true,"books":[],"projects":[]}}""";

    // Every test renders <AuthorizeView> (Community Phase 2, issue #304) --
    // SetAuthenticated(false) is still required even for the "logged out"
    // tests below, since AuthorizeView needs IAuthorizationPolicyProvider
    // registered regardless of which branch it ends up rendering.
    private RoutedFakeHttpMessageHandler UseRoutes(string profileJson)
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", profileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(false);
        return handler;
    }

    [Fact]
    public void PublicProfile_RendersUsernameAndBooksAndProjects()
    {
        UseRoutes(ProfileWithContentJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "alice"));

        Assert.Contains("alice", cut.Markup);
        Assert.Contains("Public Book", cut.Markup);
        Assert.Contains("Jane Doe", cut.Markup);
        Assert.Contains("Public World", cut.Markup);
    }

    [Fact]
    public void PublicProfile_ShowsEmptyStateMessages_WhenNoPublicContent()
    {
        UseRoutes(EmptyProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "alice"));

        Assert.Contains("noch keine öffentlichen Bücher", cut.Markup);
        Assert.Contains("noch keine öffentlichen Projekte", cut.Markup);
        Assert.Contains("noch keine öffentlichen Aktivitäten", cut.Markup);
    }

    [Fact]
    public void PublicProfile_RendersActivityLog_WithHumanReadableTextForEachType()
    {
        UseRoutes(ProfileWithActivitiesJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "alice"));

        var items = cut.FindAll("li.profile-activity-item");
        Assert.Equal(3, items.Count);
        Assert.Contains("Dune", items[0].TextContent);
        Assert.Contains("4 Sternen", items[0].TextContent);
        Assert.Contains("Mittelerde", items[1].TextContent);
        Assert.Contains("veröffentlicht", items[1].TextContent);
        Assert.Contains("Aetherfall", items[2].TextContent);
        Assert.Contains("veröffentlicht", items[2].TextContent);
    }

    [Fact]
    public void PublicProfile_ShowsNotFoundMessage_WhenUserDoesNotExist()
    {
        var handler = new RoutedFakeHttpMessageHandler().When(
            r => r.RequestUri!.AbsolutePath.EndsWith("/public"),
            _ => new HttpResponseMessage(System.Net.HttpStatusCode.NotFound));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(false);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "nobody"));

        Assert.Contains("existiert nicht", cut.Markup);
    }

    [Fact]
    public void PublicProfile_ShowsFollowerAndFollowingCounts()
    {
        UseRoutes(NotFollowingProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.Contains("3", cut.Markup);
        Assert.Contains("Follower", cut.Markup);
        Assert.Contains("1", cut.Markup);
        Assert.Contains("Folgt", cut.Markup);
    }

    [Fact]
    public void PublicProfile_HidesFollowButton_WhenLoggedOut()
    {
        UseRoutes(NotFollowingProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.DoesNotContain("Folgen", cut.Markup);
    }

    [Fact]
    public void PublicProfile_HidesFollowButton_OnOwnProfile()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", OwnProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "alice"));

        Assert.DoesNotContain("Folgen", cut.Markup);
    }

    [Fact]
    public void PublicProfile_ShowsFollowButton_WhenLoggedInAndNotFollowing()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", NotFollowingProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        var button = cut.FindAll("button").Single(b => b.TextContent.Trim() is "Folgen" or "Entfolgen");
        Assert.Equal("Folgen", button.TextContent.Trim());
    }

    [Fact]
    public void PublicProfile_ShowsEntfolgen_WhenAlreadyFollowing()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", FollowingProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        var button = cut.FindAll("button").Single(b => b.TextContent.Trim() is "Folgen" or "Entfolgen");
        Assert.Equal("Entfolgen", button.TextContent.Trim());
    }

    [Fact]
    public void PublicProfile_ClickingFollow_SendsPostAndFlipsToEntfolgen()
    {
        HttpRequestMessage? followRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/public", NotFollowingProfileJson)
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                followRequest = r;
                return new HttpResponseMessage(System.Net.HttpStatusCode.NoContent);
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));
        cut.FindAll("button").Single(b => b.TextContent.Trim() is "Folgen" or "Entfolgen").Click();

        Assert.Equal(HttpMethod.Post, followRequest?.Method);
        Assert.Equal("/api/users/bob/follow", followRequest?.RequestUri?.AbsolutePath);
        Assert.Equal("Entfolgen", cut.FindAll("button").Single(b => b.TextContent.Trim() is "Folgen" or "Entfolgen").TextContent.Trim());
    }

    [Fact]
    public void PublicProfile_ShowsNoRatingsMessage_WhenBookHasNoRatings()
    {
        UseRoutes(UnratedBookProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.Contains("Noch keine Bewertungen", cut.Markup);
    }

    [Fact]
    public void PublicProfile_ShowsAverageAndCount_WhenBookHasRatings()
    {
        UseRoutes(RatedBookProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.Contains("4.5", cut.Markup);
        Assert.Contains("(2)", cut.Markup);
    }

    [Fact]
    public void PublicProfile_HidesRatingStars_WhenLoggedOut()
    {
        UseRoutes(RatedBookProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.Empty(cut.FindAll("button.star-button"));
    }

    [Fact]
    public void PublicProfile_HidesRatingStars_OnOwnBook()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", OwnRatedBookProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "alice"));

        Assert.Empty(cut.FindAll("button.star-button"));
    }

    [Fact]
    public void PublicProfile_ShowsFiveStars_ReflectingMyRating_WhenLoggedInAndNotOwnBook()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", RatedBookProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        var stars = cut.FindAll("button.star-button");
        Assert.Equal(5, stars.Count);
        // RatedBookProfileJson's myRating is 3 -- the first 3 stars carry is-filled.
        Assert.True(stars.Take(3).All(s => s.ClassList.Contains("is-filled")));
        Assert.True(stars.Skip(3).All(s => !s.ClassList.Contains("is-filled")));
    }

    [Fact]
    public void PublicProfile_ClickingAStar_SendsPutWithThatRating()
    {
        HttpRequestMessage? rateRequest = null;
        string? requestBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/public", UnratedBookProfileJson)
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                rateRequest = r;
                requestBody = r.Content?.ReadAsStringAsync().Result;
                return new HttpResponseMessage(System.Net.HttpStatusCode.NoContent);
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));
        cut.FindAll("button.star-button")[3].Click(); // 4th star -> rating 4

        Assert.Equal(HttpMethod.Put, rateRequest?.Method);
        Assert.Equal("/api/books/9/rating", rateRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("\"rating\":4", requestBody);
    }

    [Fact]
    public void PublicProfile_ClickingYourOwnRatingAgain_SendsDelete()
    {
        HttpRequestMessage? unrateRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/public", RatedBookProfileJson)
            .When(r => r.Method == HttpMethod.Delete, r =>
            {
                unrateRequest = r;
                return new HttpResponseMessage(System.Net.HttpStatusCode.NoContent);
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));
        // RatedBookProfileJson's myRating is 3 -- clicking the 3rd star again removes it.
        cut.FindAll("button.star-button")[2].Click();

        Assert.Equal(HttpMethod.Delete, unrateRequest?.Method);
        Assert.Equal("/api/books/9/rating", unrateRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void PublicProfile_PublicBook_ShowsLesenButtonAlongsideRatingWidget_WhenLoggedIn()
    {
        var readableJson = """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[{"id":9,"title":"Public Book","author":null,"description":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PUBLIC","canRead":true,"averageRating":null,"ratingCount":0,"myRating":null}],"projects":[]}}""";
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", readableJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        var lesenLink = cut.FindAll("a").Single(a => a.TextContent.Trim() == "Lesen");
        Assert.Equal("library/books/9/read", lesenLink.GetAttribute("href"));
        Assert.Contains("Noch keine Bewertungen", cut.Markup);
    }

    [Fact]
    public void PublicProfile_PublicBook_ShowsAnmeldenPrompt_WhenLoggedOut()
    {
        var teaserOnlyJson = """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[{"id":9,"title":"Public Book","author":null,"description":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PUBLIC","canRead":false,"averageRating":null,"ratingCount":0,"myRating":null}],"projects":[]}}""";
        UseRoutes(teaserOnlyJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.Contains("Anmelden zum Lesen", cut.Markup);
        Assert.DoesNotContain(cut.FindAll("a"), a => a.TextContent.Trim() == "Lesen");
    }

    [Fact]
    public void PublicProfile_SharedBook_ShowsLesenButton_WhenCanRead()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", SharedBookReadableProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        var lesenLink = cut.FindAll("a").Single(a => a.TextContent.Trim() == "Lesen");
        Assert.Equal("library/books/9/read", lesenLink.GetAttribute("href"));
        Assert.Empty(cut.FindAll("button.star-button"));
    }

    [Fact]
    public void PublicProfile_SharedBook_ShowsPrivatGeteilt_WhenNotCanRead()
    {
        // Covers both a logged-out visitor and a logged-in user who just
        // isn't on the share list -- neither can tell the two apart, and
        // logging in wouldn't help the second case, so there's no
        // "Anmelden zum Lesen" prompt for SHARED the way there is for PUBLIC.
        UseRoutes(SharedBookNotReadableProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.Contains("Privat geteilt", cut.Markup);
        Assert.DoesNotContain(cut.FindAll("a"), a => a.TextContent.Trim() == "Lesen");
    }

    [Fact]
    public void PublicProfile_HasNoAuthorizeAttribute()
    {
        // Regression coverage, same reasoning as ImpressumPageTests: this
        // page must be reachable while logged out (Community Phase 1, issue
        // #300). bUnit's Render<T> bypasses AuthorizeRouteView entirely, so
        // it would NOT catch an [Authorize] attribute being added by mistake
        // -- check the attribute directly.
        var hasAuthorizeAttribute = typeof(PublicProfile).GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true).Length > 0;

        Assert.False(hasAuthorizeAttribute);
    }
}
