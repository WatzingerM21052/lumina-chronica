using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Services;

// The account menu loads the profile once; after renaming yourself or
// changing the avatar it kept the old name until a reload. The profile page
// announces a saved profile here and the menu takes it over. Static: one
// signed-in user per browser tab, and no DI wiring for every test.
public static class ProfileEvents
{
    public static event Action<UserProfile>? Changed;

    public static void Publish(UserProfile profile) => Changed?.Invoke(profile);
}
