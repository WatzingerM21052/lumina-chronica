import type { Context } from "hono";

// Every file/image streaming route serves user-uploaded bytes directly from
// the API origin. nosniff stops a browser from executing a mislabeled or
// disguised upload (e.g. an HTML file renamed with an image extension) as
// if it were the declared Content-Type.
//
// `cacheable` must only be true for bytes that are safe for a shared/CDN
// cache to store regardless of who asks -- i.e. a PUBLIC-visibility book or
// project cover (issue #349 Phase C). Every other route (book files, SHARED
// covers, project maps/character/location images, shelf covers, timeline
// files) defaults to `private, no-store`: these are per-viewer or
// per-permission bytes, and a shared cache serving one user's response to
// another would be a real privacy leak, not just a performance detail.
//
// PUBLIC_COVER_MAX_AGE is deliberately short (5 minutes), not a typical
// day-long asset cache duration: cover URLs are stable per book/project id
// (`/api/books/:id/cover`), so a longer max-age would let an already-cached
// copy keep circulating in a browser cache for a book that gets flipped to
// PRIVATE, or a cover that gets replaced, in the meantime. This bounds that
// exposure window instead of eliminating it outright (no purge/ETag
// revalidation implemented yet -- flagged on issue #352, not silently
// shipped as 1h).
const PUBLIC_COVER_MAX_AGE_SECONDS = 300;

export function fileResponse(c: Context, body: ReadableStream, contentType: string, options?: { cacheable?: boolean }) {
    return c.body(body, 200, {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": options?.cacheable ? `public, max-age=${PUBLIC_COVER_MAX_AGE_SECONDS}` : "private, no-store",
    });
}
