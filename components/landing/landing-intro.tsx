"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from "react";

import { ZekeMark } from "@/components/brand/zeke-mark";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type SceneProgress = { loaded: number; total: number };

const SceneProgressContext = createContext<Dispatch<
  SetStateAction<SceneProgress>
> | null>(null);

/** Never hold the page hostage: past this, the intro plays with what has loaded. */
const MAX_WAIT_MS = 8000;
/** Matches the splash's fade-out transition. */
const SPLASH_FADE_MS = 500;

/**
 * Without JS nothing would ever lift the gate, so show the page as-is.
 * (React only renders `<noscript>` contents on the server.)
 */
const NO_SCRIPT_CSS =
  '[data-landing-splash]{display:none}[data-intro="waiting"] :is(.focus-in,.scene-piece,.scene-car){animation-play-state:running}';

/**
 * The landing page's `<main>`. Every intro animation stays on its first frame
 * (`data-intro="waiting"`) behind a splash until the hero scene and fonts have
 * loaded, then the splash fades and the whole intro plays from the top.
 */
export function LandingIntro({ children, ...props }: ComponentProps<"main">) {
  const [scene, setScene] = useState<SceneProgress>({ loaded: 0, total: 1 });
  const [fontsReady, setFontsReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const ready = timedOut || (fontsReady && scene.loaded >= scene.total);

  useEffect(() => {
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setFontsReady(true);
    });
    const timeout = window.setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => {
      live = false;
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <SceneProgressContext.Provider value={setScene}>
      <main {...props} data-intro={ready ? "ready" : "waiting"}>
        <noscript>
          <style>{NO_SCRIPT_CSS}</style>
        </noscript>
        {children}
        <LandingSplash done={ready} />
      </main>
    </SceneProgressContext.Provider>
  );
}

/** Lets the hero scene tell the splash how many of its images have loaded. */
export function useReportSceneProgress(loaded: number, total: number) {
  const setScene = useContext(SceneProgressContext);
  useEffect(() => {
    setScene?.({ loaded, total });
  }, [setScene, loaded, total]);
}

function LandingSplash({ done }: { done: boolean }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!done) return;
    const timeout = window.setTimeout(() => setMounted(false), SPLASH_FADE_MS);
    return () => window.clearTimeout(timeout);
  }, [done]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center bg-[linear-gradient(to_bottom,#F1F6FB,#DCE9F5)] transition-opacity duration-500 ease-out",
        done && "pointer-events-none opacity-0",
      )}
      data-landing-splash=""
    >
      {/* Content fades in late, so a fast (cached) load is just a quick wash. */}
      <div className="flex flex-col items-center gap-5 motion-safe:animate-[page-enter_400ms_ease-out_250ms_both]">
        <div className="flex items-center gap-3">
          <ZekeMark className="size-11" variant="navy" />
          <span className="font-display text-xl font-semibold tracking-[-0.01em] text-brand-950">
            Zeke Car Rentals
          </span>
        </div>
        {/* The scene's layers load in parallel and land together, so a
            counted bar would sit at zero, then jump. */}
        <Progress className="w-44 bg-brand-950/10" value={null} />
      </div>
    </div>
  );
}
