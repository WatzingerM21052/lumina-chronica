// Minimal in-memory R2Bucket shim for tests -- only the put/get/delete
// surface bookService.ts actually uses. No new dependency, mirrors the
// approach already used for D1 in fakeD1.ts.
type StoredObject = { data: ArrayBuffer; contentType?: string };

export function createFakeR2(): R2Bucket {
    const store = new Map<string, StoredObject>();

    return {
        async put(key: string, value: ArrayBuffer | ArrayBufferView | string, options?: R2PutOptions) {
            const data =
                typeof value === "string"
                    ? new TextEncoder().encode(value).buffer
                    : value instanceof ArrayBuffer
                      ? value
                      : (value as ArrayBufferView).buffer;
            store.set(key, { data: data as ArrayBuffer, contentType: options?.httpMetadata && "contentType" in options.httpMetadata ? options.httpMetadata.contentType : undefined });
            return { key } as unknown as R2Object;
        },
        async get(key: string) {
            const stored = store.get(key);
            if (!stored) return null;
            const body = new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array(stored.data));
                    controller.close();
                },
            });
            return {
                body,
                httpMetadata: stored.contentType ? { contentType: stored.contentType } : undefined,
                async arrayBuffer() {
                    return stored.data;
                },
            } as unknown as R2ObjectBody;
        },
        async delete(key: string | string[]) {
            for (const k of Array.isArray(key) ? key : [key]) store.delete(k);
        },
    } as unknown as R2Bucket;
}
