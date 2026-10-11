using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Services;

// The account menu loads the profile once; after renaming yourself or
// changing the avatar it kept the old name until a reload. The profile page
// announces a saved profile here and the menu takes it over. Scoped (one
// per app instance) and resolved optionally by both sides, so component
// tests that don't register it simply get no events -- a static event leaked
// between tests running in parallel.
public class ProfileEvents
{
    public event Action<UserProfile>? Changed;

    public void Publish(UserProfile profile) => Changed?.Invoke(profile);
}
