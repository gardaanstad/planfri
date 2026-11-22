"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, LoaderCircle, Star, X } from "lucide-react";
import { errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import { uploadImage } from "../lib/upload-image";

const tile = "relative aspect-4/3 overflow-hidden rounded-lg";
const accepted = ["image/jpeg", "image/png", "image/webp"];

/** Pickers taking pastes, latest last; a paste with no field focused goes to it. */
const pasteTargets: HTMLElement[] = [];

function isTextField(element: Element) {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !["button", "checkbox", "file", "radio", "range", "submit"].includes(element.type)) ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/**
 * Picks images from the device and uploads them straight away; `value` holds
 * the uploaded URLs in order. Reports in-flight uploads through `onBusy`.
 * With `cover`, the first image is the cover and any other can take its place.
 * With `pasteScope`, images pasted anywhere inside the closest element matching
 * that selector are added too.
 */
export default function ImagePicker({
  value,
  onChange,
  onBusy,
  max = 10,
  cover = false,
  pasteScope,
  id,
  className,
}: {
  id?: string;
  pasteScope?: string;
  cover?: boolean;
  value: string[];
  onChange: (update: (current: string[]) => string[]) => void;
  onBusy?: (busy: boolean) => void;
  max?: number;
  className?: string;
}) {
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const room = max - value.length - pending;
  const busy = pending > 0;
  useEffect(() => onBusy?.(busy), [busy, onBusy]);

  async function add(files: File[]) {
    const picked = files.slice(0, Math.max(0, room));
    if (!picked.length) return;
    setError("");
    setPending((count) => count + picked.length);
    await Promise.all(
      picked.map(async (file) => {
        try {
          const src = await uploadImage(file);
          onChange((current) => [...current, src]);
        } catch (failure) {
          setError(errorMessage(failure, "Kunne ikke laste opp bildet."));
        } finally {
          setPending((count) => count - 1);
        }
      }),
    );
  }

  const addRef = useRef(add);
  useLayoutEffect(() => {
    addRef.current = add;
  });
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scope = pasteScope ? root?.closest<HTMLElement>(pasteScope) : null;
    if (!root || !scope) return;
    const area: HTMLElement = scope;
    pasteTargets.push(root);
    function paste(event: ClipboardEvent) {
      const data = event.clipboardData;
      if (!data || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      const inScope = target && area.contains(target);
      const unfocused = !target || target === document.body;
      if (!inScope && !(unfocused && pasteTargets.at(-1) === root)) return;
      const files = Array.from(data.files).filter((file) =>
        accepted.includes(file.type),
      );
      if (!files.length) return;
      // Rich text copied from elsewhere carries a picture of itself; in a text
      // field, the text is what was meant.
      if (target && isTextField(target) && data.types.includes("text/plain"))
        return;
      event.preventDefault();
      void addRef.current(files);
    }
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("paste", paste);
      pasteTargets.splice(pasteTargets.indexOf(root), 1);
    };
  }, [pasteScope]);

  return (
    <div ref={rootRef} id={id} className={className}>
      <ul className="grid list-none grid-cols-3 gap-2 p-0 max-xs:grid-cols-2">
        {value.map((src, index) => (
          <li key={src} className={cn(tile, "bg-surface-muted")}>
            <Image
              src={src}
              alt={`Bilde ${index + 1}`}
              fill
              sizes="180px"
              // Members' photos are private until approved; the optimizer
              // fetches without the viewer's session.
              unoptimized
              className="object-cover"
            />
            <button
              type="button"
              className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-scrim/60 text-white transition-colors hover:bg-scrim/80"
              aria-label={`Fjern bilde ${index + 1}`}
              onClick={() =>
                onChange((current) => current.filter((item) => item !== src))
              }
            >
              <X size={14} />
            </button>
            {cover &&
              (index === 0 ? (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-scrim/60 px-2 py-0.5 text-2xs font-semibold text-white">
                  Forside
                </span>
              ) : (
                <button
                  type="button"
                  className="absolute top-1.5 left-1.5 grid size-7 place-items-center rounded-full bg-scrim/60 text-white transition-colors hover:bg-scrim/80"
                  aria-label={`Bruk bilde ${index + 1} som forside`}
                  data-tooltip="Bruk som forside"
                  onClick={() =>
                    onChange((current) => [
                      src,
                      ...current.filter((item) => item !== src),
                    ])
                  }
                >
                  <Star size={14} />
                </button>
              ))}
          </li>
        ))}
        {Array.from({ length: pending }, (_, index) => (
          <li
            key={`pending-${index}`}
            className={cn(tile, "grid place-items-center bg-surface-muted text-muted")}
          >
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            <span className="sr-only">Laster opp …</span>
          </li>
        ))}
        {room > 0 && (
          <li className={tile}>
            <label
              htmlFor={inputId}
              className={cn(
                "flex size-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg",
                "border border-dashed border-border-strong text-xs font-medium text-muted",
                "transition-colors duration-120 hover:border-accent/50 hover:text-accent",
                "focus-within:border-accent focus-within:text-accent",
              )}
            >
              <ImagePlus size={18} aria-hidden="true" />
              Legg til bilde
              <input
                id={inputId}
                type="file"
                accept={accepted.join(",")}
                multiple
                className="sr-only"
                onChange={(event) => {
                  void add(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
