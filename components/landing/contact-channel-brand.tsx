"use client";

import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import {
  siKakaotalk,
  siLine,
  siMessenger,
  siTelegram,
  siViber,
  siWechat,
  siWhatsapp,
  type SimpleIcon,
} from "simple-icons";

import type {
  ContactChannel,
  ContactChannelKey,
} from "@/features/settings/lib/contact-channels";
import { cn } from "@/lib/utils";

/** Brand tile per app; Kakao's yellow needs a dark glyph to stay legible. */
const brands: Record<
  ContactChannelKey,
  { icon: SimpleIcon | null; background: string; foreground: string }
> = {
  whatsapp: { icon: siWhatsapp, background: "#25D366", foreground: "#fff" },
  viber: { icon: siViber, background: "#7360F2", foreground: "#fff" },
  wechat: { icon: siWechat, background: "#07C160", foreground: "#fff" },
  kakaotalk: { icon: siKakaotalk, background: "#FFCD00", foreground: "#191919" },
  line: { icon: siLine, background: "#06C755", foreground: "#fff" },
  telegram: { icon: siTelegram, background: "#26A5E4", foreground: "#fff" },
  messenger: { icon: siMessenger, background: "#0866FF", foreground: "#fff" },
  phone: { icon: null, background: "var(--brand-950)", foreground: "#fff" },
};

/** Where to add a copied ID, for apps with no add-contact link. */
export const copyHints: Partial<Record<ContactChannelKey, string>> = {
  wechat: "Paste in WeChat › Add contacts",
  kakaotalk: "Paste in KakaoTalk › Add friend › ID",
};

export function BrandTile({
  channelKey,
  className,
}: {
  channelKey: ContactChannelKey;
  className?: string;
}) {
  const brand = brands[channelKey];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
        className,
      )}
      style={{ background: brand.background, color: brand.foreground }}
    >
      {brand.icon ? (
        <svg fill="currentColor" viewBox="0 0 24 24">
          <path d={brand.icon.path} />
        </svg>
      ) : (
        <Phone />
      )}
    </span>
  );
}

/**
 * Copies a channel's ID for apps with no add-contact link (WeChat, a Kakao
 * ID). `copied` holds the key for a few seconds so the row can say so.
 */
export function useCopyChannel() {
  const [copied, setCopied] = useState<ContactChannelKey | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(channel: ContactChannel) {
    try {
      await navigator.clipboard.writeText(channel.detail);
    } catch {
      // Clipboard blocked (insecure origin, old browser): the ID is on screen.
      return;
    }
    setCopied(channel.key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 2500);
  }

  return { copied, copy };
}
