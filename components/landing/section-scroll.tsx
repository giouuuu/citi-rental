"use client";

import { useEffect } from "react";

/** Glide time for a jump of `distance` px: short hops stay quick. */
function glideMs(distance: number) {
  return Math.min(1100, Math.max(500, distance * 0.6));
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** react-remove-scroll (Sheet, Dialog) marks the body while it holds the page. */
const scrollLocked = () => document.body.hasAttribute("data-scroll-locked");

/**
 * Same-page `#section` links glide to their section instead of jumping, and
 * never reach the Next router: no navigation, no refetch, no re-render. Links
 * to another page's sections (`/#fleet` from a search landing page) are left
 * to next/link.
 *
 * Mounted once per page. Listens on the document in the capture phase, so it
 * runs before next/link's own click handler and can claim the click.
 */
export function SectionScroll() {
  useEffect(() => {
    let frame = 0;
    let cancelGlide: (() => void) | null = null;

    function glideTo(target: HTMLElement) {
      cancelGlide?.();
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      const to = Math.max(
        0,
        Math.min(
          target.getBoundingClientRect().top + window.scrollY - margin,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      );
      const from = window.scrollY;
      const distance = Math.abs(to - from);
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduce || distance < 2) {
        window.scrollTo({ top: to, behavior: "instant" });
        return;
      }

      const duration = glideMs(distance);
      const start = performance.now();
      // The page's CSS smooth scrolling would ease every step on its own.
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";

      const stop = () => {
        cancelAnimationFrame(frame);
        root.style.scrollBehavior = previous;
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
        window.removeEventListener("keydown", stop);
        cancelGlide = null;
      };
      // The visitor takes over the moment they scroll themselves.
      window.addEventListener("wheel", stop, { passive: true });
      window.addEventListener("touchstart", stop, { passive: true });
      window.addEventListener("keydown", stop);
      cancelGlide = stop;

      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, from + (to - from) * easeInOutCubic(t));
        if (t < 1) frame = requestAnimationFrame(step);
        else stop();
      };
      frame = requestAnimationFrame(step);
    }

    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (
        !url.hash ||
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        url.search !== window.location.search
      ) {
        return;
      }
      const target = document.getElementById(
        decodeURIComponent(url.hash.slice(1)),
      );
      if (!target) return;

      event.preventDefault();
      if (url.hash !== window.location.hash) {
        window.history.pushState(window.history.state, "", url.hash);
      }

      const keyboard = event.detail === 0;
      const go = () => {
        glideTo(target);
        // Keyboard users continue from the section they jumped to.
        if (keyboard) {
          if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
      };
      // A link in the phone menu: wait for the sheet to release the page.
      if (!scrollLocked()) {
        go();
        return;
      }
      const waitStart = performance.now();
      const wait = () => {
        if (!scrollLocked() || performance.now() - waitStart > 800) go();
        else frame = requestAnimationFrame(wait);
      };
      frame = requestAnimationFrame(wait);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      cancelGlide?.();
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
