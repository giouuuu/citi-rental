"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PenLineIcon, RotateCcwIcon, SmartphoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };

/** Blank margin kept around the ink when the signature is cropped. */
const CROP_PADDING = 12;

/**
 * Crop the ink to its bounding box so a signature drawn on a full phone
 * screen sits at a sensible size on the agreement and the PDF.
 */
function croppedSignature(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;

  const ratio = window.devicePixelRatio || 1;
  const pad = Math.round(CROP_PADDING * ratio);
  const sx = Math.max(0, left - pad);
  const sy = Math.max(0, top - pad);
  const sw = Math.min(width, right + pad + 1) - sx;
  const sh = Math.min(height, bottom + pad + 1) - sy;
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out.toDataURL("image/png");
}

/**
 * The signing surface: fills the screen so a renter can sign comfortably on
 * a phone. Strokes are kept as points, so turning the phone mid-signature
 * redraws them instead of wiping the canvas.
 */
function FullScreenSignature({
  label,
  onCancel,
  onDone,
}: {
  label: string;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    // Ink on a clear background: the white comes from CSS, so the saved PNG
    // sits cleanly on the printed agreement instead of as a white box.
    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y);
      if (stroke.length === 1) ctx.lineTo(stroke[0]!.x + 0.1, stroke[0]!.y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    redraw();
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  function point(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const at = point(event);
    strokes.current.push([at]);
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.lineTo(at.x + 0.1, at.y);
    ctx.stroke();
    setHasInk(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const stroke = strokes.current.at(-1);
    if (!ctx || !stroke) return;
    // Coalesced events keep fast strokes smooth instead of jagged.
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples = coalesced.length ? coalesced : [event.nativeEvent];
    const rect = canvasRef.current!.getBoundingClientRect();
    ctx.beginPath();
    const last = stroke.at(-1)!;
    ctx.moveTo(last.x, last.y);
    for (const sample of samples) {
      const at = { x: sample.clientX - rect.left, y: sample.clientY - rect.top };
      stroke.push(at);
      ctx.lineTo(at.x, at.y);
    }
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    strokes.current = [];
    setHasInk(false);
    redraw();
  }

  function done() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = croppedSignature(canvas);
    if (dataUrl) onDone(dataUrl);
  }

  return (
    <div className="flex size-full flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <DialogTitle className="truncate text-base">{label}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <SmartphoneIcon className="size-3.5 shrink-0 rotate-90 landscape:hidden" />
            <span className="landscape:hidden">
              Turn the phone sideways for more room.
            </span>
            <span className="hidden landscape:inline">
              Sign anywhere in the white area.
            </span>
          </DialogDescription>
        </div>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 p-3">
        <canvas
          ref={canvasRef}
          aria-label={label}
          className="size-full touch-none rounded-lg border border-border bg-white"
          onPointerCancel={end}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
        />
        {/* The signing line: a cue for where to sign, not part of the ink. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 bottom-[28%] flex items-end gap-2 border-b border-slate-300 pb-1 text-slate-400"
        >
          <span className="text-lg leading-none">×</span>
        </div>
        {!hasInk ? (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-slate-400"
          >
            Sign here with your finger
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          disabled={!hasInk}
          onClick={clear}
          type="button"
          variant="outline"
        >
          <RotateCcwIcon />
          Clear
        </Button>
        <Button disabled={!hasInk} onClick={done} size="lg" type="button">
          Done
        </Button>
      </div>
    </div>
  );
}

/**
 * A signature field. Tapping it opens a full-screen pad; the field then
 * shows the signature, ready to redo or clear.
 */
export function InspectionSignaturePad({
  value,
  onChange,
  label = "Customer signature",
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button
        aria-label={value ? `${label}: signed. Tap to sign again` : `${label}: tap to sign`}
        className={cn(
          "relative flex h-36 w-full items-center justify-center overflow-hidden rounded-md border bg-white transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          value
            ? "border-border"
            : "border-dashed border-muted-foreground/40 hover:border-primary/60",
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        {value ? (
          <Image
            alt={label}
            className="object-contain p-3"
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            src={value}
            unoptimized
          />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-sm font-medium text-slate-500">
            <PenLineIcon className="size-5" />
            Tap to sign
          </span>
        )}
      </button>

      {value ? (
        <div className="flex justify-end gap-2">
          <Button onClick={() => onChange(null)} size="sm" type="button" variant="ghost">
            Clear
          </Button>
          <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
            Sign again
          </Button>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overscroll-none rounded-none p-0 ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
          showCloseButton={false}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {open ? (
            <FullScreenSignature
              label={label}
              onCancel={() => setOpen(false)}
              onDone={(dataUrl) => {
                onChange(dataUrl);
                setOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
