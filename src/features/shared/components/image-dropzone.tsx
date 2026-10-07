"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";
import { ImageUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fileMatchesAccept } from "@/features/shared/lib/file-accept";
import { cn } from "@/lib/utils";

export const DEFAULT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

function hasFiles(event: DragEvent) {
  return event.dataTransfer.types.includes("Files");
}

/**
 * Every image upload: drag and drop one or more images, or click (tap on
 * phones) to open the picker.
 *
 * A real `<input type="file">` sits inside, visually hidden, so keyboard
 * focus, `capture`, and native `FormData` forms (`name`) keep working —
 * dropped files are written back onto it.
 *
 * `prepare` runs on each file before `onFiles` (e.g. `compressImage`), with
 * an "Optimizing" state in the zone; `busy` shows the caller's own work, such
 * as an upload, and locks the zone meanwhile.
 */
export function ImageDropzone({
  id,
  name,
  accept = DEFAULT_IMAGE_ACCEPT,
  multiple = false,
  capture,
  disabled = false,
  invalid = false,
  required = false,
  value,
  onFiles,
  onBlur,
  prepare,
  busy,
  hint,
  ref,
  className,
}: {
  id: string;
  name?: string;
  accept?: string;
  /** Accept several files at once — from the picker or a single drop. */
  multiple?: boolean;
  capture?: "user" | "environment";
  disabled?: boolean;
  invalid?: boolean;
  required?: boolean;
  /** The file(s) currently chosen; shown in the zone with a clear button. */
  value?: File | File[] | null;
  /** Called with the accepted files, or `[]` when cleared. */
  onFiles: (files: File[]) => void;
  onBlur?: () => void;
  /** Transform each accepted file before `onFiles`, e.g. compress it. */
  prepare?: (file: File) => Promise<File>;
  /** Label for work in progress on the chosen file (e.g. "Uploading…"). */
  busy?: string | null;
  hint?: ReactNode;
  ref?: Ref<HTMLInputElement>;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(0);

  const files = value ? (Array.isArray(value) ? value : [value]) : [];

  const setInput = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Cleared from outside (form reset, upload done): empty the native input
  // too, so a stale file is not submitted and re-picking it still fires.
  useEffect(() => {
    const input = inputRef.current;
    if (files.length === 0 && input?.files?.length) input.value = "";
  }, [files.length]);

  async function take(incoming: File[]) {
    if (incoming.length === 0) return;
    const accepted = incoming.filter((file) => fileMatchesAccept(file, accept));
    const picked = multiple ? accepted : accepted.slice(0, 1);

    const skipped = incoming.length - accepted.length;
    setRejection(
      skipped === 0
        ? null
        : picked.length === 0
          ? "That file type isn't supported here."
          : `Skipped ${skipped} file${skipped === 1 ? "" : "s"} that ${skipped === 1 ? "isn't a" : "aren't"} supported image${skipped === 1 ? "" : "s"}.`,
    );
    if (picked.length === 0) return;

    let ready = picked;
    if (prepare) {
      setPreparing(picked.length);
      try {
        ready = await Promise.all(picked.map(prepare));
      } catch {
        setRejection("Could not read that image. Try another photo.");
        if (inputRef.current) inputRef.current.value = "";
        return;
      } finally {
        setPreparing(0);
      }
    }

    const input = inputRef.current;
    if (input) {
      try {
        const transfer = new DataTransfer();
        for (const file of ready) transfer.items.add(file);
        input.files = transfer.files;
      } catch {
        // Older browsers cannot assign files; controlled callers still work.
      }
    }
    onFiles(ready);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setRejection(null);
    onFiles([]);
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (locked) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = locked ? "none" : "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (locked) return;
    void take(Array.from(event.dataTransfer.files));
  }

  const noun = multiple ? "images" : "an image";
  const working =
    busy ||
    (preparing > 0
      ? `Optimizing ${preparing === 1 ? "photo" : `${preparing} photos`}…`
      : null);
  const locked = disabled || Boolean(working);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className={cn(
          "relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input bg-muted/30 px-4 py-3 text-center transition-colors",
          "hover:border-ring/60 hover:bg-muted/50",
          "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/30",
          files.length > 0 && "border-primary/40 bg-primary/5",
          dragging && "border-primary bg-primary/10",
          invalid && "border-destructive ring-2 ring-destructive/20",
          disabled && "pointer-events-none cursor-not-allowed opacity-60",
          working && "pointer-events-none",
        )}
        aria-busy={working ? true : undefined}
        data-dragging={dragging || undefined}
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <input
          accept={accept}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          capture={capture}
          className="sr-only"
          disabled={locked}
          id={id}
          multiple={multiple}
          name={name}
          onBlur={onBlur}
          onChange={(event) => void take(Array.from(event.target.files ?? []))}
          onClick={(event) => event.stopPropagation()}
          ref={setInput}
          type="file"
        />

        {working ? (
          <Spinner className="size-6 text-primary" />
        ) : (
          <ImageUp
            aria-hidden="true"
            className={cn(
              "size-6 text-muted-foreground",
              (dragging || files.length > 0) && "text-primary",
            )}
          />
        )}

        {files.length > 0 ? (
          <p className="max-w-full truncate px-6 text-sm font-medium text-foreground">
            {files.length === 1 ? files[0].name : `${files.length} images selected`}
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {working ? (
            <span className="font-medium text-primary">{working}</span>
          ) : dragging ? (
            <span className="font-medium text-primary">
              Drop to add {noun}
            </span>
          ) : (
            <>
              <span className="pointer-coarse:hidden">
                {files.length > 0 ? "Drop or " : `Drag & drop ${noun}, or `}
                <span className="font-medium text-primary underline-offset-4 hover:underline">
                  {files.length > 0 ? "choose another" : "browse"}
                </span>
              </span>
              <span className="hidden font-medium text-primary pointer-coarse:inline">
                {files.length > 0 ? "Tap to replace" : `Tap to add ${noun}`}
              </span>
            </>
          )}
        </p>

        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

        {files.length > 0 && !locked ? (
          <Button
            aria-label={multiple ? "Clear selected images" : "Clear selected image"}
            className="absolute top-1.5 right-1.5"
            onClick={(event) => {
              event.stopPropagation();
              clear();
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        ) : null}
      </div>

      {rejection ? (
        <p aria-live="polite" className="text-xs text-destructive">
          {rejection}
        </p>
      ) : null}
    </div>
  );
}
