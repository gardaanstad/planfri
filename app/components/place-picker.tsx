"use client";

import {
  Fragment,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { MapPin, Plus } from "lucide-react";
import { cn } from "../lib/cn";
import { mainCities, placeName } from "../lib/places";
import { useCommunity } from "./community-provider";

const fold = (text: string) => text.trim().toLocaleLowerCase("nb");

/**
 * A project's place, typed: the main cities, then every other place
 * projects name, A–Å, show below to pick from, narrowed as it's typed. A
 * name none of them match is offered last, to add as a new place.
 */
export default function PlacePicker({
  value,
  onChange,
  className,
  ...inputProps
}: {
  value: string;
  onChange: (value: string) => void;
  /** The field's classes, as the form's other fields. */
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const { projects } = useCommunity();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Typed since opening: the list narrows to what's typed.
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);

  const places = useMemo(() => {
    const others = new Set(
      projects.map((project) => placeName(project.city.trim())),
    );
    for (const city of mainCities) others.delete(city);
    others.delete("");
    return [
      ...mainCities,
      ...[...others].sort((a, b) => a.localeCompare(b, "nb")),
    ];
  }, [projects]);

  const query = fold(value);
  const filtering = typed && !!query;
  // Names starting with it first, then those holding it, each in list order.
  const matches = filtering
    ? [
        ...places.filter((place) => fold(place).startsWith(query)),
        ...places.filter((place) => {
          const name = fold(place);
          return !name.startsWith(query) && name.includes(query);
        }),
      ]
    : places;
  const adding =
    filtering && !places.some((place) => fold(place) === query)
      ? value.trim()
      : "";
  const count = matches.length + (adding ? 1 : 0);

  useLayoutEffect(() => {
    const popup = menu.current;
    const field = input.current;
    if (!open || !popup || !field) return;
    // The top layer keeps it clear of the panel's clipped, scrolled content.
    popup.showPopover();
    const place = () => {
      const rect = field.getBoundingClientRect();
      const gutter = 14;
      const gap = 6;
      const below = window.innerHeight - rect.bottom - gutter - gap;
      const above = rect.top - gutter - gap;
      const upward = below < 200 && above > below;
      Object.assign(popup.style, {
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        maxHeight: `${Math.min(300, Math.max(80, upward ? above : below))}px`,
        top: upward ? "auto" : `${rect.bottom + gap}px`,
        bottom: upward ? `${window.innerHeight - rect.top + gap}px` : "auto",
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (popup.matches(":popover-open")) popup.hidePopover();
    };
  }, [open]);

  // The active option stays in sight as the arrows move it.
  useLayoutEffect(() => {
    if (!open || active < 0) return;
    menu.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setTyped(false);
    setActive(-1);
  };
  const pick = (place: string) => {
    onChange(place);
    close();
  };
  const optionId = (index: number) => `${listId}-${index}`;
  const optionClass = (index: number) =>
    cn(
      "flex min-h-9 w-full shrink-0 cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui text-ink",
      "pointer-coarse:min-h-11 hover:bg-surface-muted",
      // Reaches halfway across the gaps, so none is dead to the pointer.
      "relative before:absolute before:inset-x-0 before:-inset-y-0.5",
      index === active && "bg-surface-muted",
    );

  return (
    <div className="relative min-w-0">
      <input
        {...inputProps}
        ref={input}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        maxLength={80}
        placeholder="Skriv eller velg et sted"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setTyped(true);
          setOpen(true);
          setActive(event.target.value.trim() ? 0 : -1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={close}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) return setOpen(true);
            if (!count) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive(
              active < 0
                ? step > 0
                  ? 0
                  : count - 1
                : (active + step + count) % count,
            );
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (active >= 0 && active < matches.length) pick(matches[active]);
            else if (active >= 0 && adding) pick(adding);
            else close();
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      />
      <div
        ref={menu}
        id={listId}
        popover="manual"
        role="listbox"
        aria-label="Forslag til sted"
        data-slot="place-menu"
        className={cn(
          "fixed inset-auto z-900 m-0 flex-col gap-1 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-1.5 text-ink",
          "shadow-[0_12px_40px_rgb(20_28_24/0.14),0_2px_6px_rgb(20_28_24/0.04)]",
          open && count ? "flex" : "hidden",
        )}
        // Choosing keeps the field focused.
        onPointerDown={(event) => event.preventDefault()}
      >
        {matches.map((place, index) => (
          <Fragment key={place}>
            {!filtering && index === mainCities.length && (
              <div
                role="separator"
                className="mx-2.5 my-1 shrink-0 border-t border-border"
              />
            )}
            <div
              id={optionId(index)}
              data-index={index}
              role="option"
              aria-selected={index === active}
              className={optionClass(index)}
              onClick={() => pick(place)}
            >
              <MapPin size={15} aria-hidden="true" className="shrink-0 text-muted" />
              <span className="min-w-0 truncate">{place}</span>
            </div>
          </Fragment>
        ))}
        {adding && (
          <div
            id={optionId(matches.length)}
            data-index={matches.length}
            role="option"
            aria-selected={active === matches.length}
            aria-label={`Legg til ${adding}`}
            data-slot="place-add"
            className={optionClass(matches.length)}
            onClick={() => pick(adding)}
          >
            <Plus size={15} aria-hidden="true" className="shrink-0 text-muted" />
            <span className="min-w-0 truncate">{adding}</span>
            <span className="ml-auto shrink-0 text-xs text-muted">Nytt sted</span>
          </div>
        )}
      </div>
    </div>
  );
}
