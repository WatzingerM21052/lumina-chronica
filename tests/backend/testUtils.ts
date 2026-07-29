// Hono's typed Response.json() resolves to `unknown` under
// @cloudflare/workers-types; tests just want the parsed envelope.
export async function readJson<T = any>(res: Response): Promise<T> {
    return (await res.json()) as T;
}
