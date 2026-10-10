/**
 * A booking typed in before sign-in, held in this browser across the
 * sign-in round trip (Google leaves the page). IndexedDB, because the ID
 * photos are Files and sessionStorage only holds strings.
 *
 * The draft is cleared as soon as it is restored, and ignored once stale,
 * so ID photos never linger on the device.
 */

const DB_NAME = "zeke-booking";
const STORE = "drafts";
const KEY = "pending";
/** Long enough for a Google sign-in or a password reset, short enough to forget. */
const MAX_AGE_MS = 60 * 60 * 1000;

export type BookingDraft<TValues> = {
  vehicleId: string;
  values: TValues;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Resolves false when the browser cannot store it (private mode, blocked storage). */
export async function saveBookingDraft<TValues>(
  vehicleId: string,
  values: TValues,
): Promise<boolean> {
  try {
    const draft: BookingDraft<TValues> = {
      vehicleId,
      values,
      savedAt: Date.now(),
    };
    await run("readwrite", (store) => store.put(draft, KEY));
    return true;
  } catch {
    return false;
  }
}

/** Takes the draft for this car out of storage, if there is a fresh one. */
export async function takeBookingDraft<TValues>(
  vehicleId: string,
): Promise<TValues | null> {
  try {
    const draft = await run<BookingDraft<TValues> | undefined>(
      "readonly",
      (store) => store.get(KEY),
    );
    if (!draft) return null;
    const fresh = Date.now() - draft.savedAt < MAX_AGE_MS;
    if (!fresh || draft.vehicleId === vehicleId) await clearBookingDraft();
    return fresh && draft.vehicleId === vehicleId ? draft.values : null;
  } catch {
    return null;
  }
}

export async function clearBookingDraft() {
  try {
    await run("readwrite", (store) => store.delete(KEY));
  } catch {
    // Nothing stored, or storage is blocked: either way there is nothing to clear.
  }
}
