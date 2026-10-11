import "server-only";

import { resolve4, resolve6, resolveMx } from "node:dns/promises";

const LOOKUP_TIMEOUT_MS = 2500;

/** Error codes meaning "this domain has no such record", not "DNS is down". */
const MISSING = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

type Lookup = "found" | "missing" | "unknown";

async function lookup(run: () => Promise<unknown[]>): Promise<Lookup> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), LOOKUP_TIMEOUT_MS);
      }),
    ]);
    return records.length > 0 ? "found" : "missing";
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    return MISSING.has(code) ? "missing" : "unknown";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * False only when DNS says the domain cannot receive mail: no MX record and
 * no address to fall back to. A slow or failing lookup counts as deliverable,
 * so a DNS hiccup never blocks a real customer — the emailed code is the
 * real check.
 */
export async function canDomainReceiveEmail(domain: string): Promise<boolean> {
  const mx = await lookup(() => resolveMx(domain));
  if (mx !== "missing") return true;
  // RFC 5321: with no MX, mail goes to the domain's own address.
  const [v4, v6] = await Promise.all([
    lookup(() => resolve4(domain)),
    lookup(() => resolve6(domain)),
  ]);
  return v4 !== "missing" || v6 !== "missing";
}
