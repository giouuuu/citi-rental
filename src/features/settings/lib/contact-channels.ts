/**
 * Chat apps the landing page offers visitors, in the order they are listed.
 * Most renters are tourists who message on their home app: Koreans on
 * KakaoTalk, Chinese on WeChat, Japanese/Thai/Taiwanese on LINE.
 */
export const CONTACT_CHANNEL_KEYS = [
  "whatsapp",
  "viber",
  "wechat",
  "kakaotalk",
  "line",
  "telegram",
  "messenger",
  "phone",
] as const;

export type ContactChannelKey = (typeof CONTACT_CHANNEL_KEYS)[number];

/** Raw values the owner saved; empty means the channel is hidden. */
export type ContactChannelValues = Record<ContactChannelKey, string>;

/** Settings field name on `company_profile` for each channel. */
export const contactChannelField = (key: ContactChannelKey) =>
  `contact_${key}` as const;

export const contactChannelSettings: Record<
  ContactChannelKey,
  { label: string; placeholder: string; description: string; kind: "phone" | "handle" }
> = {
  whatsapp: {
    label: "WhatsApp number",
    placeholder: "+63 917 123 4567",
    description: "International format, with the country code.",
    kind: "phone",
  },
  viber: {
    label: "Viber number",
    placeholder: "+63 917 123 4567",
    description: "International format, with the country code.",
    kind: "phone",
  },
  wechat: {
    label: "WeChat ID",
    placeholder: "zekecarrentals",
    description: "Visitors copy it and add you in WeChat.",
    kind: "handle",
  },
  kakaotalk: {
    label: "KakaoTalk",
    placeholder: "https://open.kakao.com/o/… or Kakao ID",
    description: "An open-chat link opens directly; a Kakao ID is copied.",
    kind: "handle",
  },
  line: {
    label: "LINE ID",
    placeholder: "@zekecars",
    description: "Official account (@…), personal ID, or a line.me link.",
    kind: "handle",
  },
  telegram: {
    label: "Telegram username",
    placeholder: "zekecars",
    description: "Without the @.",
    kind: "handle",
  },
  messenger: {
    label: "Messenger page",
    placeholder: "zekecarrentals",
    description: "Facebook page username, as in m.me/zekecarrentals.",
    kind: "handle",
  },
  phone: {
    label: "Phone for calls",
    placeholder: "+63 917 123 4567",
    description: "International format, with the country code.",
    kind: "phone",
  },
};

export type ContactChannel = {
  key: ContactChannelKey;
  /** Brand name, plus the native name where visitors know it by that. */
  label: string;
  nativeLabel?: string;
  /** The number or ID, shown under the label. */
  detail: string;
  /** Opens the app. Null means the app has no add-contact link: copy `detail`. */
  href: string | null;
};

const nativeLabels: Partial<Record<ContactChannelKey, string>> = {
  wechat: "微信",
  kakaotalk: "카카오톡",
};

const brandLabels: Record<ContactChannelKey, string> = {
  whatsapp: "WhatsApp",
  viber: "Viber",
  wechat: "WeChat",
  kakaotalk: "KakaoTalk",
  line: "LINE",
  telegram: "Telegram",
  messenger: "Messenger",
  phone: "Call us",
};

const isUrl = (value: string) => /^https?:\/\//i.test(value);
/**
 * Country code plus number, digits only, as wa.me and Viber need. A leading 00
 * is the international prefix; a lone leading 0 is a local Philippine number.
 */
function internationalDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `63${digits.slice(1)}`;
  return digits;
}
const handle = (value: string) => value.replace(/^@/, "");

function channelHref(
  key: ContactChannelKey,
  value: string,
  greeting: string,
): string | null {
  switch (key) {
    case "whatsapp":
      return `https://wa.me/${internationalDigits(value)}?text=${encodeURIComponent(greeting)}`;
    case "viber":
      return `viber://chat?number=%2B${internationalDigits(value)}`;
    case "phone":
      return `tel:+${internationalDigits(value)}`;
    case "telegram":
      return isUrl(value) ? value : `https://t.me/${handle(value)}`;
    case "messenger":
      return isUrl(value) ? value : `https://m.me/${handle(value)}`;
    case "line":
      if (isUrl(value)) return value;
      // Official accounts keep their @; personal IDs take a ~ prefix.
      return value.startsWith("@")
        ? `https://line.me/R/ti/p/${encodeURIComponent(value)}`
        : `https://line.me/R/ti/p/~${encodeURIComponent(value)}`;
    case "kakaotalk":
      return isUrl(value) ? value : null;
    case "wechat":
      return null;
  }
}

/** The channels the owner filled in, ready to render. */
export function buildContactChannels(
  values: Partial<ContactChannelValues>,
  greeting: string,
): ContactChannel[] {
  return CONTACT_CHANNEL_KEYS.flatMap((key) => {
    const value = values[key]?.trim();
    if (!value) return [];
    const href = channelHref(key, value, greeting);
    return [
      {
        key,
        label: brandLabels[key],
        nativeLabel: nativeLabels[key],
        // A link already says where it goes; show the ID only when it is the point.
        detail: isUrl(value) ? "Open chat" : value,
        href,
      },
    ];
  });
}
