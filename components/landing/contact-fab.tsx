"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRight, Check, Copy, MessageCircle } from "lucide-react";

import { ZekeMark } from "@/components/brand/zeke-mark";
import {
  BrandTile,
  copyHints,
  useCopyChannel,
} from "@/components/landing/contact-channel-brand";
import { landingFontClassName } from "@/components/landing/landing-fonts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ContactChannel } from "@/features/settings/lib/contact-channels";
import { cn } from "@/lib/utils";

/** Height of the bottom strip the button floats in, plus breathing room. */
const FAB_ZONE_PX = 96;

/**
 * Floating chat button for visitors who would rather message than book cold.
 * Opens a list of the owner's chat apps; links open the app, and apps without
 * add-contact links (WeChat, a Kakao ID) copy the ID instead.
 *
 * It steps aside while the hero search card sits in the bottom strip, so it
 * never covers "Search cars".
 */
export function ContactFab({
  channels,
  avoidSelector,
  className,
  style,
}: {
  channels: ContactChannel[];
  /** An element the button must not cover; it hides while that is in its zone. */
  avoidSelector?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const { copied, copy } = useCopyChannel();

  useEffect(() => {
    if (!avoidSelector) return;
    const target = document.querySelector(avoidSelector);
    if (!target) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const rect = target.getBoundingClientRect();
      const zoneTop = window.innerHeight - FAB_ZONE_PX;
      setBlocked(rect.bottom > zoneTop && rect.top < window.innerHeight);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [avoidSelector]);

  if (!channels.length) return null;

  // Never yank the button out from under an open list.
  const hidden = blocked && !open;

  return (
    <div
      className={cn(
        "fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 sm:right-6 sm:bottom-6",
        className,
      )}
      style={style}
    >
      <div
        className={cn(
          "transition-[opacity,transform] duration-200 ease-out",
          hidden && "pointer-events-none translate-y-3 scale-90 opacity-0",
        )}
        inert={hidden}
      >
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger asChild>
            <button
              aria-label="Chat with Zeke Car Rental & Services"
              className="flex items-center gap-2.5 rounded-full bg-brand-950 p-1.5 text-white shadow-[0_18px_40px_-14px_rgb(7_17_31/0.6)] ring-1 ring-white/10 transition-transform duration-150 ease-out outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 active:scale-95 md:pr-5"
              type="button"
            >
              <span className="relative">
                <span className="block size-11 overflow-hidden rounded-full">
                  <ZekeMark className="size-full" title="" />
                </span>
                <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-white text-brand-950 ring-2 ring-brand-950">
                  <MessageCircle aria-hidden="true" className="size-3" />
                </span>
              </span>
              <span className="hidden text-sm font-semibold md:block">
                Chat with us
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            // Portaled out of the landing <main>, so it brings the font variables.
            className={cn(
              landingFontClassName,
              "w-[min(20rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl p-0 font-landing",
            )}
            collisionPadding={16}
            side="top"
            sideOffset={12}
          >
            <div className="flex items-center gap-3 bg-brand-950 px-4 py-3.5 text-white">
              <ZekeMark className="size-10" title="" />
              <div className="min-w-0">
                <p className="font-semibold">Chat with the owner</p>
                <p className="text-xs text-white/70">
                  Message us on the app you use.
                </p>
              </div>
            </div>
            <p className="border-b px-4 py-2 text-xs text-muted-foreground">
              <span lang="ko">문의하기</span> ·{" "}
              <span lang="zh-Hans">联系我们</span> ·{" "}
              <span lang="ja">お問い合わせ</span>
            </p>
            <ul className="max-h-[min(24rem,60svh)] overflow-y-auto p-1.5">
              {channels.map((channel) => (
                <li key={channel.key}>
                  <ChannelRow
                    channel={channel}
                    copied={copied === channel.key}
                    onCopy={() => void copy(channel)}
                  />
                </li>
              ))}
            </ul>
            <p aria-live="polite" className="sr-only">
              {copied
                ? `${channels.find((c) => c.key === copied)?.label} ID copied.`
                : ""}
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

function ChannelRow({
  channel,
  copied,
  onCopy,
}: {
  channel: ContactChannel;
  copied: boolean;
  onCopy: () => void;
}) {
  const body = (
    <>
      <BrandTile channelKey={channel.key} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-brand-950">
          {channel.label}
          {channel.nativeLabel ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {channel.nativeLabel}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {copied
            ? (copyHints[channel.key] ?? "Copied")
            : channel.href
              ? channel.detail
              : `${channel.detail} · Tap to copy ID`}
        </span>
      </span>
    </>
  );

  if (channel.href) {
    const external = channel.href.startsWith("http");
    return (
      <a
        className={ROW_CLASS}
        href={channel.href}
        rel={external ? "noreferrer" : undefined}
        target={external ? "_blank" : undefined}
      >
        {body}
        <ArrowUpRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </a>
    );
  }

  return (
    <button className={ROW_CLASS} onClick={onCopy} type="button">
      {body}
      {copied ? (
        <Check aria-hidden="true" className="size-4 shrink-0 text-teal-700" />
      ) : (
        <Copy
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      )}
    </button>
  );
}
