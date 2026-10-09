"use client";

import Image, { type StaticImageData } from "next/image";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { HeroCarControls, HeroCarGallery, useHeroFleet } from "@/components/landing/hero-fleet";
import { useReportSceneProgress } from "@/components/landing/landing-intro";
import { cn } from "@/lib/utils";

import car from "./hero-scene/car.webp";
import foliageLeft from "./hero-scene/foliage-left.webp";
import foliageRight from "./hero-scene/foliage-right.webp";
import hills from "./hero-scene/hills.webp";
import mountains from "./hero-scene/mountains.webp";
import preview from "./hero-scene/preview.webp";
import road from "./hero-scene/road.webp";
import sky from "./hero-scene/sky.webp";
import trees from "./hero-scene/trees.webp";

type Layer = {
  key: string;
  image: StaticImageData;
  /** 0 = infinitely far, 1 = at the camera. Scales scroll and pointer drift. */
  depth: number;
  /** Where the piece enters from during the intro. */
  from: string;
  delay: number;
};

/**
 * The scene photo, split by depth into layers that share one frame: every
 * layer is the full image size, transparent outside its own piece, with the
 * area behind nearer pieces painted in so they can drift without holes.
 */
const LAYERS: Layer[] = [
  // Back layers carry painted-in fill behind the nearer pieces, so the intro
  // builds from the road outward: each layer settles in behind one that is
  // already showing, and the fill is never seen.
  { key: "sky", image: sky, depth: 0, from: "none", delay: 0 },
  { key: "mountains", image: mountains, depth: 0.08, from: "translateY(4%)", delay: 620 },
  { key: "hills", image: hills, depth: 0.16, from: "translateY(4%)", delay: 470 },
  { key: "trees", image: trees, depth: 0.28, from: "translateY(3%)", delay: 320 },
  { key: "foliage-left", image: foliageLeft, depth: 0.5, from: "translateX(-3%)", delay: 140 },
  { key: "foliage-right", image: foliageRight, depth: 0.5, from: "translateX(3%)", delay: 140 },
  { key: "road", image: road, depth: 0.7, from: "none", delay: 0 },
];

/** Max drift, in px, for a layer at depth 1. */
const POINTER_PX = 28;
/**
 * The title hangs in the sky between the sky and mountain layers, and sinks
 * faster than the mountains on scroll, so it sets behind the ridge as the
 * page moves on.
 */
const TITLE_DEPTH = 0.04;
const TITLE_SCROLL_RATE = 0.62;
/** The caption rides with the title and is gone by the time it has set. */
const CAPTION_FADE_PX = 180;
/**
 * Where the car stands: the near lane, just above the search card. On phones
 * the frame runs 4rem under the card, so the wheels clear its top edge.
 */
const CAR_SLOT =
  "absolute bottom-[5.25rem] left-1/2 w-[66vw] max-w-[24rem] -translate-x-1/2 md:bottom-[20%] md:max-w-none md:w-[min(46vw,34rem)] lg:bottom-[19%] lg:w-[min(36vw,38rem)]";
const CAR_SIZES = "(min-width: 1024px) 36vw, (min-width: 768px) 46vw, 66vw";
const SETTLE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const SCROLL_RATE = 0.35;
/** Shared crop so every layer stays registered to the same photo. */
const FRAME = "object-cover object-[50%_58%]";

/**
 * Layered hero scene: the road is there from the first frame, the car drives
 * up it from the horizon while the scenery settles in behind, then the layers
 * drift apart with scroll and pointer for depth.
 *
 * `title` stands on the mountain ridge, behind the peaks; `caption` sits just
 * under it, in front of the scenery. Both are decorative here (the scene is
 * `aria-hidden`), so the page keeps its own screen-reader heading.
 */
export function HeroScene({
  className,
  title,
  caption,
}: {
  className?: string;
  title?: ReactNode;
  caption?: ReactNode;
}) {
  const { cars: fleet, index: active, direction } = useHeroFleet();
  const carItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const shownRef = useRef(active);
  const rootRef = useRef<HTMLDivElement>(null);
  // Back layers hold painted-in fill under the road and foliage. Revealing
  // them before every layer has loaded shows that fill as a green smear on a
  // slow connection, so the intro waits; the preview photo covers the wait.
  const [loadedLayers, setLoadedLayers] = useState(0);
  const sceneReady = loadedLayers >= LAYERS.length;
  // The landing splash also waits for the first car, so it drives up a road
  // that is actually there.
  const [carLoaded, setCarLoaded] = useState(false);
  useReportSceneProgress(loadedLayers + (carLoaded ? 1 : 0), LAYERS.length + 1);
  const layerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const carRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  // Swap: the shown car pulls aside and fades as the next one drives up the
  // road from the horizon, like the intro.
  useEffect(() => {
    const previous = shownRef.current;
    if (previous === active) return;
    shownRef.current = active;
    const outgoing = carItemRefs.current[previous];
    const incoming = carItemRefs.current[active];
    if (!outgoing || !incoming) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const element of [outgoing, incoming]) {
      element.getAnimations().forEach((animation) => {
        animation.commitStyles();
        animation.cancel();
      });
    }
    // Inline opacity from the first render would fight the animation's fill.
    incoming.style.opacity = "";

    if (reduce) {
      outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" });
      incoming.animate([{ opacity: 0, filter: "none", transform: "none" }, { opacity: 1, filter: "none", transform: "none" }], {
        duration: 250,
        fill: "forwards",
      });
      return;
    }

    outgoing.animate(
      [
        { opacity: 1, transform: "none", filter: "blur(0px)" },
        {
          opacity: 0,
          transform: `translateX(${direction * -38}%) scale(0.9)`,
          filter: "blur(6px)",
        },
      ],
      { duration: 380, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    );
    incoming.animate(
      [
        {
          opacity: 0,
          transform: `translate(${direction * 6}%, -55%) scale(0.14)`,
          transformOrigin: "50% 100%",
          filter: "blur(4px)",
        },
        { opacity: 1, offset: 0.25 },
        { opacity: 1, transform: "none", transformOrigin: "50% 100%", filter: "blur(0px)" },
      ],
      { duration: 1000, delay: 140, easing: SETTLE_EASE, fill: "both" },
    );
  }, [active, direction]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let scroll = window.scrollY;
    let frame = 0;
    let visible = true;

    function render() {
      frame = 0;
      // Ease toward the pointer so the scene glides rather than tracks.
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;

      LAYERS.forEach((layer, index) => {
        const element = layerRefs.current[index];
        if (!element) return;
        const x = current.x * POINTER_PX * layer.depth;
        // Far layers lag behind the page as it scrolls; the road keeps pace.
        const y = current.y * POINTER_PX * 0.5 * layer.depth + scroll * SCROLL_RATE * (1 - layer.depth);
        element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      });
      const titleX = current.x * POINTER_PX * TITLE_DEPTH;
      const titleY = current.y * POINTER_PX * 0.5 * TITLE_DEPTH + scroll * TITLE_SCROLL_RATE;
      const titleTransform = `translate3d(${titleX.toFixed(2)}px, ${titleY.toFixed(2)}px, 0)`;
      if (titleRef.current) titleRef.current.style.transform = titleTransform;
      const captionElement = captionRef.current;
      if (captionElement) {
        captionElement.style.transform = titleTransform;
        captionElement.style.opacity = Math.max(0, 1 - scroll / CAPTION_FADE_PX).toFixed(3);
      }
      const carElement = carRef.current;
      if (carElement) {
        const x = current.x * POINTER_PX * 0.85;
        const y = current.y * POINTER_PX * 0.4 + scroll * SCROLL_RATE * 0.15;
        carElement.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      }

      const settling =
        Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001;
      if (settling) request();
    }

    function request() {
      if (!frame && visible) frame = requestAnimationFrame(render);
    }

    function onScroll() {
      scroll = Math.min(window.scrollY, root!.offsetHeight);
      request();
    }

    function onPointer(event: PointerEvent) {
      target.x = event.clientX / window.innerWidth - 0.5;
      target.y = event.clientY / window.innerHeight - 0.5;
      request();
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) request();
    });
    observer.observe(root);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (finePointer) window.addEventListener("pointermove", onPointer, { passive: true });
    request();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute overflow-hidden", className)}
      data-scene={sceneReady ? "ready" : "loading"}
      ref={rootRef}
    >
      {/* The whole photo, tiny and blurred: on screen from the first paint
          and hidden under the layers once they have loaded. */}
      <div className="absolute -inset-[4%]">
        <Image
          alt=""
          className={cn(FRAME, "scale-105 blur-md")}
          fill
          placeholder="blur"
          priority
          sizes="108vw"
          src={preview}
        />
      </div>

      {LAYERS.map((layer, index) => (
        <Fragment key={layer.key}>
          <div
            className="absolute -inset-[4%] will-change-transform"
            ref={(element) => {
              layerRefs.current[index] = element;
            }}
          >
            <div
              className="scene-piece absolute inset-0"
              style={
                {
                  "--piece-from": layer.from,
                  "--piece-delay": `${layer.delay}ms`,
                } as CSSProperties
              }
            >
              <Image
                alt=""
                className={cn(FRAME, "select-none")}
                draggable={false}
                fill
                onLoad={() => setLoadedLayers((count) => count + 1)}
                priority
                sizes="108vw"
                src={layer.image}
              />
            </div>
          </div>
          {/* Behind the mountains, so the peaks rise in front of the word. */}
          {layer.key === "sky" && title ? (
            <div className="hero-ridge absolute -inset-[4%] will-change-transform" ref={titleRef}>
              <div className="hero-ridge-anchor top-[var(--lockup-top)]">{title}</div>
            </div>
          ) : null}
        </Fragment>
      ))}

      {caption ? (
        <div className="hero-ridge absolute -inset-[4%] will-change-transform" ref={captionRef}>
          <div className="hero-ridge-anchor top-[calc(var(--lockup-top)+var(--title-size)*1.2+0.75rem)]">
            {caption}
          </div>
        </div>
      ) : null}

      {/* Sits in the near lane, between the road and the search card. */}
      <div className={CAR_SLOT}>
        <div className="will-change-transform" ref={carRef}>
          <div className="scene-car relative aspect-[900/692]">
            {fleet.length ? (
              fleet.map((item, index) => (
                <div
                  className="absolute inset-x-0 bottom-0"
                  key={item.id}
                  ref={(element) => {
                    carItemRefs.current[index] = element;
                  }}
                  style={index === active ? undefined : { opacity: 0 }}
                >
                  <CarShadow />
                  <Image
                    alt=""
                    className="relative h-auto w-full select-none"
                    draggable={false}
                    height={692}
                    loading="eager"
                    onLoad={index === active ? () => setCarLoaded(true) : undefined}
                    priority={index === 0}
                    sizes={CAR_SIZES}
                    src={item.imageUrl}
                    width={900}
                  />
                </div>
              ))
            ) : (
              <div className="absolute inset-x-0 bottom-0">
                <CarShadow />
                <Image
                  alt=""
                  className="relative h-auto w-full select-none"
                  draggable={false}
                  onLoad={() => setCarLoaded(true)}
                  priority
                  sizes={CAR_SIZES}
                  src={car}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CarShadow() {
  return (
    <span className="absolute inset-x-[3%] -bottom-[5%] h-[14%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(10_12_14/0.6),transparent)]" />
  );
}

/**
 * Previous / next buttons and the photo-gallery button, lined up with the
 * car. Give it the same frame
 * (`className`) as the HeroScene so the two line up on every screen.
 */
export function HeroSceneControls({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute z-30", className)}>
      <div className={CAR_SLOT}>
        <div className="relative aspect-[900/692]">
          <HeroCarGallery className="absolute inset-x-[4%] top-[12%] bottom-0" />
          <HeroCarControls className="absolute inset-x-[-3.25rem] top-1/2 -translate-y-1/2 sm:inset-x-[-5.5rem]" />
        </div>
      </div>
    </div>
  );
}
