"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, Check, Copy, Mail, MapPin } from "lucide-react";

import {
  BrandTile,
  copyHints,
  useCopyChannel,
} from "@/components/landing/contact-channel-brand";
import type { ContactChannel } from "@/features/settings/lib/contact-channels";

const CARD_CLASS =
  "flex h-full w-full items-center gap-4 rounded-2xl bg-card p-4 text-left ring-1 ring-border transition-[box-shadow,background-color] outline-none sm:p-5";
const LINK_CARD_CLASS = `${CARD_CLASS} hover:bg-muted/50 hover:ring-brand-950/20 focus-visible:ring-2 focus-visible:ring-ring`;

/**
 * Every way to reach the owner, laid out in the page for visitors who scroll
 * past the floating chat button. Chat apps open directly; WeChat and a Kakao
 * ID copy instead, as they have no add-contact link.
 */
export function ContactCards({
  channels,
  email,
  location,
}: {
  channels: ContactChannel[];
  email: string;
  /** Where the business is based, e.g. "Consolacion, Cebu". */
  location: string;
}) {
  const { copied, copy } = useCopyChannel();

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((channel) => (
          <li key={channel.key}>
            {channel.href ? (
              <a
                className={LINK_CARD_CLASS}
                href={channel.href}
                rel={channel.href.startsWith("http") ? "noreferrer" : undefined}
                target={channel.href.startsWith("http") ? "_blank" : undefined}
              >
                <CardBody
                  detail={channel.detail}
                  icon={<BrandTile channelKey={channel.key} className="size-11" />}
                  label={channel.label}
                  nativeLabel={channel.nativeLabel}
                />
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </a>
            ) : (
              <button
                className={LINK_CARD_CLASS}
                onClick={() => void copy(channel)}
                type="button"
              >
                <CardBody
                  detail={
                    copied === channel.key
                      ? (copyHints[channel.key] ?? "Copied")
                      : `${channel.detail} · Tap to copy ID`
                  }
                  icon={<BrandTile channelKey={channel.key} className="size-11" />}
                  label={channel.label}
                  nativeLabel={channel.nativeLabel}
                />
                {copied === channel.key ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-teal-700"
                  />
                ) : (
                  <Copy
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
              </button>
            )}
          </li>
        ))}
        <li>
          <a className={LINK_CARD_CLASS} href={`mailto:${email}`}>
            <CardBody
              detail={email}
              icon={<PlainTile icon={<Mail />} />}
              label="Email"
            />
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </a>
        </li>
        <li>
          <div className={CARD_CLASS}>
            <CardBody
              detail="We deliver anywhere in Cebu province"
              icon={<PlainTile icon={<MapPin />} />}
              label={`Based in ${location}`}
            />
          </div>
        </li>
      </ul>
      <p aria-live="polite" className="sr-only">
        {copied
          ? `${channels.find((c) => c.key === copied)?.label} ID copied.`
          : ""}
      </p>
    </>
  );
}

function CardBody({
  icon,
  label,
  nativeLabel,
  detail,
}: {
  icon: ReactNode;
  label: string;
  nativeLabel?: string;
  detail: string;
}) {
  return (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-brand-950">
          {label}
          {nativeLabel ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {nativeLabel}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {detail}
        </span>
      </span>
    </>
  );
}

function PlainTile({ icon }: { icon: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 [&_svg]:size-5"
    >
      {icon}
    </span>
  );
}
