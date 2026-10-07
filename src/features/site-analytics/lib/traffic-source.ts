/**
 * Where a public-site visit came from. Explicit link tags win over click ids,
 * which win over the referrer. `null` means "direct": keep whatever source the
 * visitor already carries.
 *
 * Tag a link with `?fb` (or `?fb=oct-promo` to name the post), `?ig`, `?tt`,
 * `?src=<anything>`, or the usual `utm_source` / `utm_campaign`.
 */
export type TrafficSource = {
  source: string;
  campaign: string | null;
  referrerHost: string | null;
};

const TAG_PARAMS: [param: string, source: string][] = [
  ["fb", "facebook"],
  ["ig", "instagram"],
  ["tt", "tiktok"],
];

const CLICK_IDS: [param: string, source: string][] = [
  ["fbclid", "facebook"],
  ["igshid", "instagram"],
  ["ttclid", "tiktok"],
  ["gclid", "google"],
];

/** Referrer hosts (and their subdomains) folded into one source name. */
const HOST_SOURCES: [host: string, source: string][] = [
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["fb.me", "facebook"],
  ["messenger.com", "facebook"],
  ["instagram.com", "instagram"],
  ["tiktok.com", "tiktok"],
  ["youtube.com", "youtube"],
  ["t.co", "x"],
  ["x.com", "x"],
  ["twitter.com", "x"],
  ["bing.com", "bing"],
  ["yahoo.com", "yahoo"],
  ["duckduckgo.com", "duckduckgo"],
];

/**
 * Hosts a visitor bounces through mid-booking: Google sign-in, Supabase auth,
 * PayMongo checkout. Coming back from them is not a new source.
 */
const PASS_THROUGH_HOSTS = ["accounts.google.com", "supabase.co", "paymongo.com"];

const SOURCE_PATTERN = /^[a-z0-9._-]{1,40}$/;

function matchesHost(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Lowercased, trimmed to the `site_events.source` check. */
export function normalizeSource(value: string): string | null {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!cleaned || !SOURCE_PATTERN.test(cleaned)) return null;
  const alias = HOST_SOURCES.find(([host]) => matchesHost(cleaned, host));
  if (alias) return alias[1];
  if (cleaned === "fb" || cleaned === "meta") return "facebook";
  if (cleaned === "ig") return "instagram";
  return cleaned;
}

function cleanCampaign(value: string | null | undefined): string | null {
  const trimmed = value?.trim().slice(0, 80);
  return trimmed ? trimmed : null;
}

function referrerHostOf(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function sourceFromHost(host: string): string | null {
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
  const known = HOST_SOURCES.find(([domain]) => matchesHost(host, domain));
  return known ? known[1] : normalizeSource(host);
}

export function detectTrafficSource({
  search,
  referrer,
  ownHost,
}: {
  /** `location.search`, with or without the leading `?`. */
  search: string;
  referrer?: string | null;
  /** This site's host, so internal navigation never counts as a referral. */
  ownHost?: string | null;
}): TrafficSource | null {
  const params = new URLSearchParams(search);
  const referrerHost = referrerHostOf(referrer);
  const ownReferrer =
    referrerHost !== null &&
    (referrerHost === ownHost?.toLowerCase().replace(/^www\./, "") ||
      PASS_THROUGH_HOSTS.some((host) => matchesHost(referrerHost, host)));
  const externalReferrer = ownReferrer ? null : referrerHost;

  for (const [param, source] of TAG_PARAMS) {
    if (params.has(param)) {
      return {
        source,
        campaign: cleanCampaign(params.get(param)) ?? cleanCampaign(params.get("utm_campaign")),
        referrerHost: externalReferrer,
      };
    }
  }

  const tagged = params.get("utm_source") ?? params.get("src");
  const taggedSource = tagged ? normalizeSource(tagged) : null;
  if (taggedSource) {
    return {
      source: taggedSource,
      campaign: cleanCampaign(params.get("utm_campaign")),
      referrerHost: externalReferrer,
    };
  }

  for (const [param, source] of CLICK_IDS) {
    if (params.has(param)) {
      return {
        source,
        campaign: cleanCampaign(params.get("utm_campaign")),
        referrerHost: externalReferrer,
      };
    }
  }

  if (externalReferrer) {
    const source = sourceFromHost(externalReferrer);
    if (source) return { source, campaign: null, referrerHost: externalReferrer };
  }

  return null;
}

/** Display name for a stored source. */
export function sourceLabel(source: string): string {
  switch (source) {
    case "direct":
      return "Direct / unknown";
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    case "google":
      return "Google";
    case "youtube":
      return "YouTube";
    case "x":
      return "X (Twitter)";
    default:
      return source;
  }
}
