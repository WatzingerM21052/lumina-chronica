import type { Context } from "hono";

// Every file/image streaming route serves user-uploaded bytes directly from
// the API origin. nosniff stops a browser from executing a mislabeled or
// disguised upload (e.g. an HTML file renamed with an image extension) as
// if it were the declared Content-Type.
export function fileResponse(c: Context, body: ReadableStream, contentType: string) {
    return c.body(body, 200, {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
    });
}
