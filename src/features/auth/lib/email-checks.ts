/**
 * Cheap checks on an email before we send it a code. They catch typos and
 * throwaway inboxes; only the emailed code proves the person owns the address.
 */

/** Inboxes our customers actually use; typos are matched against these. */
const COMMON_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.com.ph",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
] as const;

/** Misspellings too far from the real domain for the distance check. */
const KNOWN_TYPOS: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.ph": "gmail.com",
  "gmail.com.ph": "gmail.com",
  "googlemail.co": "gmail.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahoo.ph": "yahoo.com.ph",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "icloud.co": "icloud.com",
};

/**
 * Throwaway inbox services. Not exhaustive: these are the ones people reach
 * for first; the MX check and the code itself do the rest.
 */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "anonaddy.me",
  "burnermail.io",
  "byom.de",
  "dispostable.com",
  "dropmail.me",
  "emailondeck.com",
  "fakeinbox.com",
  "fakemail.net",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "harakirimail.com",
  "inboxbear.com",
  "incognitomail.org",
  "jetable.org",
  "maildrop.cc",
  "mailcatch.com",
  "maildim.com",
  "mailinator.com",
  "mailinator.net",
  "mailinator2.com",
  "mailnesia.com",
  "mailpoof.com",
  "mailsac.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "mytemp.email",
  "nada.email",
  "sharklasers.com",
  "spam4.me",
  "spambox.us",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempinbox.com",
  "tempmail.com",
  "tempmail.dev",
  "tempmail.net",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "tmail.ws",
  "tmpmail.net",
  "tmpmail.org",
  "trashmail.com",
  "trashmail.de",
  "trashmail.net",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

export const DISPOSABLE_EMAIL_MESSAGE =
  "Use an email you keep, not a temporary inbox. Your booking updates go there.";

export function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/** True for a known throwaway inbox, subdomains included. */
export function isDisposableEmailDomain(domain: string) {
  const parts = domain.toLowerCase().split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length]!;
}

/**
 * "juan@gmial.com" → "juan@gmail.com". Null when the domain looks right or
 * is nothing like a common one (a company domain stays as typed).
 */
export function suggestEmailCorrection(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (!domain || (COMMON_DOMAINS as readonly string[]).includes(domain)) {
    return null;
  }

  const known = KNOWN_TYPOS[domain];
  if (known) return `${local}@${known}`;

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  // One slip for short domains, two for longer ones; more is a different domain.
  const allowed = domain.length <= 8 ? 1 : 2;
  return best && bestDistance > 0 && bestDistance <= allowed
    ? `${local}@${best}`
    : null;
}
