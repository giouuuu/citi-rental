"use client";

import { useEffect } from "react";

/**
 * Marks each `[data-reveal-group]` list as revealed the first time it scrolls
 * into view, which starts its items' staggered rise-in (globals.css). One
 * observer for the whole page; each list reveals once and stays revealed.
 */
export function RevealGroups() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    const observe = () =>
      document
        .querySelectorAll("[data-reveal-group]:not([data-revealed])")
        .forEach((group) => observer.observe(group));
    observe();
    // Lists that mount later (the fleet grid after an empty result) join in.
    let frame = 0;
    const mutations = new MutationObserver(() => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          observe();
        });
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
