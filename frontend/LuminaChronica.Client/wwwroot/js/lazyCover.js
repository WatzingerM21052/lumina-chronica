// Defers a cover's byte fetch until its card is actually near the viewport
// (issue #349 Phase C -- "echtes Lazy Loading" for cover images). Native
// `loading="lazy"` doesn't apply here: covers are fetched as authenticated
// byte payloads (ApiClient.GetBytesAsync) and turned into blob URLs, not
// plain <img src="...">, so there's nothing for the browser's own lazy-load
// heuristic to defer.
//
// One observer per root at a time -- re-running `observe` (e.g. after a
// sort change reloads the list) disconnects the previous one first, so a
// stale observer from an earlier render never double-fires for an element
// that's since been replaced.
let currentObserver = null;

export function observe(root, dotNetHelper, methodName) {
    currentObserver?.disconnect();
    if (!root) return;

    currentObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            currentObserver.unobserve(entry.target);
            const id = parseInt(entry.target.dataset.bookId, 10);
            dotNetHelper.invokeMethodAsync(methodName, id);
        }
    }, { rootMargin: "300px 0px" }); // start the fetch a bit before the card is actually visible, not exactly on-screen

    root.querySelectorAll("[data-lazy-cover]").forEach((el) => currentObserver.observe(el));
}
