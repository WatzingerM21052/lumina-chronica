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
// (`/api/books/:id/cover`). Exported so route handlers can build a matching
// 304 response (see conditionalCoverResponse below) -- a revalidation
// response must still carry a fresh Cache-Control, or the client has no
// idea how much longer to trust the copy it already has.
export const PUBLIC_COVER_MAX_AGE_SECONDS = 300;

export function fileResponse(c: Context, body: ReadableStream, contentType: string, options?: { cacheable?: boolean; etag?: string }) {
    const headers: Record<string, string> = {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": options?.cacheable ? `public, max-age=${PUBLIC_COVER_MAX_AGE_SECONDS}` : "private, no-store",
    };
    if (options?.etag) headers.ETag = options.etag;
    return c.body(body, 200, headers);
}

// Real cache invalidation for cover routes (issue #352 follow-up): R2's
// httpEtag changes whenever the underlying object is replaced (a new
// cover upload), so a conditional request lets an already-cached client
// find out its copy is stale without waiting out the short max-age above,
// and confirms nothing changed (a cheap 304, no body) once it does expire.
// This does not by itself un-cache a cover after a PUBLIC -> PRIVATE
// visibility flip -- that's still bounded only by the short max-age, since
// the route already 404s a disallowed viewer before ever reaching this
// function, so there's no object/etag to compare against for them.
export function conditionalCoverResponse(c: Context, object: { httpEtag: string; body: ReadableStream; httpMetadata?: { contentType?: string } }, cacheable: boolean) {
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
        return c.body(null, 304, {
            ETag: object.httpEtag,
            "Cache-Control": cacheable ? `public, max-age=${PUBLIC_COVER_MAX_AGE_SECONDS}` : "private, no-store",
        });
    }
    return fileResponse(c, object.body, object.httpMetadata?.contentType ?? "application/octet-stream", { cacheable, etag: object.httpEtag });
}
