"use client";
import { useEffect, useEffectEvent } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  MapPinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import type { Project } from "../lib/data";
import {
  formatLength,
  formatRef,
  osmColors,
  osmDraft,
  osmKindLabels,
  osmKinds,
  osmModeLabels,
  osmPlace,
  type OsmStatus,
  osmStatuses,
  osmStatusLabels,
} from "../lib/osm-candidates";
import { cn } from "../lib/cn";
import { DropdownPopup } from "./dropdown";
import {
  iconButton,
  menuItem,
  menuSeparator,
  primaryButton,
  secondaryButton,
} from "../lib/ui";
import { Menu } from "@base-ui/react/menu";
import { SwitchTrack } from "./action-sheet";
import type { OsmReview } from "./osm-review";

const smallIcon = cn(iconButton, "size-8 rounded-lg pointer-coarse:size-10");
const filterChip = cn(
  "group/chip inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-transparent pr-2.5 pl-1.5 text-xs font-medium text-muted",
  "transition-[color,background-color,border-color] duration-150 motion-reduce:transition-none",
  "hover:bg-ink/[0.05] hover:text-ink aria-checked:text-ink",
  "pointer-coarse:h-9",
);
const fetchedFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** A checkbox, filled with the given colour when checked. */
function Box({ checked, color }: { checked: boolean; color?: string }) {
  return (
    <span
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center rounded-sm border-[1.5px] text-surface",
        checked ? "border-transparent" : "border-border-strong bg-surface",
        checked && !color && "bg-accent",
      )}
      style={checked && color ? { backgroundColor: color } : undefined}
      aria-hidden="true"
    >
      {checked && <Check size={10} strokeWidth={3.5} />}
    </span>
  );
}
/** A line sample: solid under construction, dotted when proposed. */
function StatusSample({ status, on }: { status: OsmStatus; on: boolean }) {
  return (
    <svg
      width="16"
      height="6"
      aria-hidden="true"
      // Phones keep the bar to two rows.
      className={cn("shrink-0 max-sm:hidden", !on && "opacity-50")}
    >
      <line
        x1="3"
        y1="3"
        x2="13"
        y2="3"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={status === "proposed" ? "0.1 4.5" : undefined}
      />
    </svg>
  );
}

/** The ⋯ menu: hidden candidates, and reading OSM again. */
function MoreMenu({ review }: { review: OsmReview }) {
  const hidden = review.feed?.dismissed.length ?? 0;
  const fetchedAt = review.feed?.fetchedAt;
  const disabled = "data-disabled:pointer-events-none data-disabled:opacity-45";
  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(smallIcon, "data-popup-open:bg-ink/[0.05] data-popup-open:text-ink")}
        aria-label="Flere valg"
        data-tooltip="Flere valg"
      >
        <Ellipsis size={18} aria-hidden="true" />
      </Menu.Trigger>
      <DropdownPopup sideOffset={6} className="w-64">
        <Menu.CheckboxItem
          className={cn(menuItem, disabled)}
          checked={review.showHidden}
          disabled={!hidden && !review.showHidden}
          closeOnClick
          onCheckedChange={review.setShowHidden}
        >
          {review.showHidden ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
          <span className="flex-1">
            {review.showHidden ? "Ikke vis skjulte" : "Vis skjulte"}
          </span>
          <span className="text-xs text-muted tabular-nums">{hidden}</span>
        </Menu.CheckboxItem>
        <Menu.Item
          className={cn(menuItem, disabled)}
          disabled={!hidden}
          onClick={() => void review.resetDismissed()}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Nullstill skjulte
        </Menu.Item>
        <Menu.Separator className={menuSeparator} />
        <Menu.CheckboxItem
          className={menuItem}
          checked={review.hideProjects}
          closeOnClick
          onCheckedChange={review.setHideProjects}
        >
          <MapPinOff size={16} aria-hidden="true" />
          <span className="mr-3 flex-1">Skjul eksisterende prosjekter</span>
          <SwitchTrack on={review.hideProjects} />
        </Menu.CheckboxItem>
        <Menu.Separator className={menuSeparator} />
        <Menu.Item
          className={cn(menuItem, disabled)}
          disabled={review.refreshing}
          onClick={() => void review.refresh()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span className="flex flex-col">
            Oppdater fra OpenStreetMap
            {fetchedAt && (
              <span className="text-xs text-muted">
                Hentet {fetchedFormat.format(new Date(fetchedAt))}
              </span>
            )}
          </span>
        </Menu.Item>
      </DropdownPopup>
    </Menu.Root>
  );
}

/**
 * The OSM mode over the map: a bar with what to show, stepping and the
 * mode's own close; under it, the selected candidate and what can be done
 * with it.
 */
export function OsmPanel({
  review,
  keyboard,
  onCreate,
  onOpenProject,
  className,
}: {
  review: OsmReview;
  /** j/k step through candidates, Escape lets go; off under panels. */
  keyboard: boolean;
  onCreate: (draft: Partial<Project>) => void;
  onOpenProject: (id: string) => void;
  className?: string;
}) {
  const { feed, selected, queue } = review;
  const position = selected
    ? queue.findIndex((entry) => entry.candidate.id === selected.candidate.id)
    : -1;
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented)
      return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable], dialog, [role=menu]"))
      return;
    if (event.key === "j") review.step(1);
    else if (event.key === "k") review.step(-1);
    else if (event.key === "Escape" && review.selected) review.select(null);
    else return;
    event.preventDefault();
  });
  useEffect(() => {
    if (!keyboard) return;
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [keyboard]);

  if (!review.on) return null;
  const candidate = selected?.candidate;
  const exists = selected?.state === "exists";
  const empty = feed && !feed.fetchedAt;
  return (
    <div
      role="region"
      aria-label="Nye veier og baner fra OpenStreetMap"
      data-osm-panel=""
      className={cn("flex w-[min(460px,calc(100%-24px))] flex-col gap-2", className)}
    >
      <div className="rounded-xl border border-border bg-surface py-1 pr-1 pl-1.5 shadow-popover">
        <div className="flex items-center gap-0.5">
          {osmKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="checkbox"
              aria-checked={review.kinds[kind]}
              className={filterChip}
              onClick={() =>
                review.setKinds({ ...review.kinds, [kind]: !review.kinds[kind] })
              }
            >
              <Box checked={review.kinds[kind]} color={osmColors[kind]} />
              {osmKindLabels[kind]}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-0.5">
            <MoreMenu review={review} />
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <button
              type="button"
              className={smallIcon}
              aria-label="Slå av nye veier og baner"
              data-tooltip="Slå av"
              onClick={review.toggle}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-0.5">
          {osmStatuses.map((status) => (
            <button
              key={status}
              type="button"
              role="checkbox"
              aria-checked={review.statuses[status]}
              className={filterChip}
              onClick={() =>
                review.setStatuses({
                  ...review.statuses,
                  [status]: !review.statuses[status],
                })
              }
            >
              <Box checked={review.statuses[status]} />
              <StatusSample status={status} on={review.statuses[status]} />
              {osmStatusLabels[status]}
            </button>
          ))}
          <div className="ml-auto flex items-center">
            <button
              type="button"
              className={smallIcon}
              aria-label="Forrige"
              data-tooltip="Forrige · K"
              disabled={!queue.length}
              onClick={() => review.step(-1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            {position >= 0 && (
              <span
                className="px-0.5 text-xs text-muted tabular-nums max-sm:hidden"
                data-osm-position=""
              >
                {position + 1} / {queue.length}
              </span>
            )}
            <button
              type="button"
              className={smallIcon}
              aria-label="Neste"
              data-tooltip="Neste · J"
              disabled={!queue.length}
              onClick={() => review.step(1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        {(review.loading || review.refreshing || review.error || empty) && (
          <div
            className="mt-1 flex min-h-9 items-center gap-2 border-t border-border px-1.5 pt-1 text-xs text-muted"
            role="status"
          >
            {review.loading || review.refreshing ? (
              <>
                <LoaderCircle
                  size={16}
                  className="shrink-0 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {review.refreshing ? "Henter fra OpenStreetMap …" : "Laster …"}
              </>
            ) : (
              <>
                <span className="mr-auto">{review.error}</span>
                {empty && (
                  <button
                    type="button"
                    className={cn(primaryButton, "min-h-8 rounded-lg px-3 text-xs")}
                    onClick={() => void review.refresh()}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    Hent fra OpenStreetMap
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {selected && candidate && (
        <div
          className="rounded-xl border border-border bg-surface px-3 pt-2.5 pb-3 shadow-popover"
          data-osm-selected={candidate.id}
        >
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-item text-ink">
              {selected.title}
            </h2>
            <button
              type="button"
              // Over the card's padding, so the title row keeps its height.
              className={cn(smallIcon, "-my-1.5 -mr-1.5")}
              aria-label="Fjern valget"
              data-tooltip="Fjern valget"
              onClick={() => review.select(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {[
              osmStatusLabels[candidate.status],
              osmModeLabels[candidate.mode],
              candidate.ref && formatRef(candidate.ref),
              formatLength(candidate.length),
              osmPlace(candidate),
              candidate.opening,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {selected.found && (
            <p className="mt-2 flex min-w-0 items-baseline gap-1 text-xs text-muted">
              <span className="shrink-0">{exists ? "Finnes:" : "Overlapper:"}</span>
              <button
                type="button"
                className="min-w-0 truncate font-medium text-accent hover:underline hover:underline-offset-2"
                onClick={() => onOpenProject(selected.found!.project.id)}
              >
                {selected.found.project.title}
              </button>
              {!exists && (
                <span className="shrink-0 tabular-nums">
                  {Math.round(selected.found.share * 100)} %
                </span>
              )}
            </p>
          )}
          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              className={cn(
                exists ? secondaryButton : primaryButton,
                "min-h-9 rounded-lg px-3 text-ui",
              )}
              onClick={() => onCreate(osmDraft(candidate, selected.title))}
            >
              <Plus size={16} aria-hidden="true" />
              {exists ? "Opprett likevel" : "Opprett prosjekt"}
            </button>
            {selected.state === "dismissed" ? (
              <button
                type="button"
                className={cn(secondaryButton, "min-h-9 rounded-lg px-3 text-ui")}
                onClick={() => review.restore(candidate.id)}
              >
                <Eye size={16} aria-hidden="true" />
                Vis igjen
              </button>
            ) : (
              !exists && (
                <button
                  type="button"
                  className={cn(secondaryButton, "min-h-9 rounded-lg px-3 text-ui")}
                  onClick={() => void review.dismiss(candidate.id)}
                >
                  <EyeOff size={16} aria-hidden="true" />
                  Skjul
                </button>
              )
            )}
            <a
              className={cn(smallIcon, "ml-auto")}
              href={`https://www.openstreetmap.org/way/${candidate.ways[0]}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Åpne i OpenStreetMap"
              data-tooltip="Åpne i OpenStreetMap"
            >
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
