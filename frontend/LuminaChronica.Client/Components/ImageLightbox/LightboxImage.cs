namespace LuminaChronica.Client.Components;

// One picture in ImageLightbox: Url is a displayable (blob) URL, Id lets the
// caller map a download request back to its own file.
public record LightboxImage(int Id, string Url, string Name);
