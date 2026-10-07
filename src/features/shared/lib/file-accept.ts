/**
 * Whether a file satisfies an `<input accept>` string. The browser filters the
 * picker dialog for us, but dropped files arrive unfiltered.
 *
 * Some platforms report an empty MIME type (HEIC on Windows, for one), so an
 * exact type like `image/heic` also matches on the `.heic` extension.
 */
export function fileMatchesAccept(file: File, accept?: string) {
  if (!accept?.trim()) return true;

  const type = file.type.toLowerCase();
  const extension = file.name.toLowerCase().split(".").pop() ?? "";

  return accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith(".")) return token.slice(1) === extension;
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
      if (token === type) return true;
      return type === "" && token.split("/")[1] === extension;
    });
}

/**
 * Drop several files on one slot of a fixed set (gallery angles, inspection
 * photos): the first goes to that slot, the rest to the free slots after it
 * in order. Files beyond the last free slot are dropped.
 */
export function assignFilesToSlots({
  slots,
  start,
  files,
  isTaken,
}: {
  slots: readonly string[];
  start: string;
  files: File[];
  isTaken: (slot: string) => boolean;
}): Array<[slot: string, file: File]> {
  const [first, ...rest] = files;
  if (!first) return [];

  const assigned: Array<[string, File]> = [[start, first]];
  for (const slot of slots.slice(slots.indexOf(start) + 1)) {
    const file = rest[0];
    if (!file) break;
    if (isTaken(slot)) continue;
    assigned.push([slot, file]);
    rest.shift();
  }
  return assigned;
}

/** `assignFilesToSlots` over a map of chosen files; returns the new map. */
export function fillSlotsFrom({
  slots,
  start,
  files,
  current,
}: {
  slots: readonly string[];
  start: string;
  files: File[];
  current: Record<string, File | null>;
}): Record<string, File | null> {
  const next = { ...current };
  const assigned = assignFilesToSlots({
    slots,
    start,
    files,
    isTaken: (slot) => Boolean(current[slot]),
  });
  for (const [slot, file] of assigned) next[slot] = file;
  return next;
}
