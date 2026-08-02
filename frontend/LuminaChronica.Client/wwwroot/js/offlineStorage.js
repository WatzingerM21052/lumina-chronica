// Client-side offline book storage via IndexedDB -- lets a user explicitly
// save a single book's file bytes for reading without a network connection
// (spec flow: Buch auswählen -> Offline speichern -> Ohne Internet lesen).
// Deliberately scoped to per-book file caching only, not a full PWA/service
// worker app shell -- a service worker's scope interacts with this app's
// GitHub Pages subpath rewrite (base href "/" -> "/lumina-chronica/" at
// deploy time) and, once misconfigured, can permanently pin stale assets in
// a user's real browser across deploys with no way to fix it server-side.
// That's a real follow-up, not this one.

const DB_NAME = "lumina-offline-books";
const DB_VERSION = 1;
const STORE_NAME = "books";

let dbPromise;

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
}

function runTransaction(mode, work) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const result = work(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
    }));
}

export async function saveBook(id, title, author, format, fileBytes, fileContentType) {
    const record = {
        id,
        title,
        author: author ?? null,
        format,
        fileBytes: new Uint8Array(fileBytes),
        fileContentType,
        sizeBytes: fileBytes.length,
        savedAt: new Date().toISOString(),
    };
    await runTransaction("readwrite", (store) => store.put(record));
}

export async function deleteBook(id) {
    await runTransaction("readwrite", (store) => store.delete(id));
}

export async function getStatus(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
        request.onsuccess = () => {
            const record = request.result;
            resolve(record ? { saved: true, sizeBytes: record.sizeBytes } : { saved: false, sizeBytes: 0 });
        };
        request.onerror = () => reject(request.error);
    });
}

export async function getBookFile(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
        request.onsuccess = () => {
            const record = request.result;
            resolve(record
                ? { title: record.title, author: record.author, format: record.format, fileBytes: record.fileBytes, fileContentType: record.fileContentType }
                : null);
        };
        request.onerror = () => reject(request.error);
    });
}

// Metadata only (no fileBytes) -- listing every saved book's full bytes at
// once would defeat the point of storing them off-heap.
export async function listBooks() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const items = [];
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(items);
                return;
            }
            const { id, title, author, format, sizeBytes, savedAt } = cursor.value;
            items.push({ id, title, author, format, sizeBytes, savedAt });
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}
