import { Fragment, memo } from "react";
import Image from "next/image";
import {
  Bookmark,
  CarFront,
  MapPin,
  Megaphone,
  MessageCircle,
  TrainFront,
  TrainFrontTunnel,
  TramFront,
} from "lucide-react";
import {
  finishYear,
  formatDate,
  getProjectUpdates,
  hasPhoto,
  type Project,
  projectPhotos,
  projectPlace,
  railCategories,
  statuses,
  transportMode,
} from "../lib/data";
import type { CardDensity } from "../lib/explore-state";
import { type ProjectNews, unreadCount, unreadSummary } from "../lib/unread";
import { cn } from "../lib/cn";
import { keyboardFocused, statusTone, wrapTitle } from "../lib/ui";
import ImageGallery, { thumbSizes } from "./image-gallery";

const modeIcons = {
  Vei: CarFront,
  Jernbane: TrainFront,
  "T-bane": TrainFrontTunnel,
  Sporvei: TramFront,
};

/** Where; for rail and road, led by the mode. */
function Place({ project }: { project: Project }) {
  const mode = transportMode(project.categories);
  if (!mode)
    return (
      <>
        <MapPin size={13} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{projectPlace(project)}</span>
      </>
    );
  const label =
    mode === "road"
      ? "Vei"
      : (railCategories.find((category) =>
          project.categories.includes(category),
        ) ?? "Jernbane");
  const Icon = modeIcons[label];
  return (
    <>
      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-ink-soft">
        <Icon size={13} className="shrink-0" aria-hidden="true" />
        {label}
      </span>
      <span aria-hidden="true">·</span>
      <span className="min-w-0 truncate">{projectPlace(project)}</span>
    </>
  );
}

type Section = "discussion" | "updates";
/** Where a project opens: a section, or an update or comment in it. */
export type CardTarget = Section | { updateId?: string; commentId?: string };

// Above the stretched card link, for the stat tooltips.
const cardStat = "relative z-1 inline-flex items-center gap-1.25 tabular-nums";
// One line each, so a compact row keeps one height (18 + 4 + 22 + 4 + 18)
// unless its title needs more.
const meta = "flex min-w-0 items-center text-xs leading-4.5 text-muted";
// Expanded: the counts under the photos, quiet until hovered; above the
// card link.
// No fill, so nothing shifts off the text edge; the hit area reaches past it.
const action = cn(
  "relative z-1 inline-flex h-6 items-center gap-1.5 text-ui font-medium text-muted tabular-nums",
  "transition-colors duration-150 hover:text-ink motion-reduce:transition-none [&>svg]:shrink-0",
  "after:absolute after:-inset-x-1.5 after:-inset-y-1.5 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus",
);
// The hover wash and the card link reach 12px past the text sideways and
// 8px past the padding's content vertically.
const wash = "before:inset-y-2 max-md:before:inset-y-1.5";
const reach = "after:inset-y-2 max-md:after:inset-y-1.5";

/**
 * What is new since the user last opened the project: a dot and a count in
 * the accent colour, at the end of the stats, with the details on hover.
 */
export function UnreadMark({
  news,
  className,
}: {
  news: ProjectNews;
  className?: string;
}) {
  const count = unreadCount(news);
  const summary = unreadSummary(news);
  return (
    <span
      className={cn(
        "relative z-1 inline-flex shrink-0 items-center gap-1.25 font-medium whitespace-nowrap text-accent-strong tabular-nums",
        className,
      )}
      data-tooltip={summary}
      data-unread-mark=""
    >
      <i className="size-1.5 shrink-0 rounded-full bg-accent" />
      <span aria-hidden="true">{count === 1 ? "1 ny" : `${count} nye`}</span>
      <span className="sr-only">{summary} siden sist</span>
    </span>
  );
}

/** One project in the results list; the whole card opens the project. */
/** Memoized with stable callbacks, so a list change only renders new cards. */
export default memo(function ProjectCard({
  project,
  commentCount,
  density,
  saved,
  offMap = false,
  news,
  onOpen,
  onSave,
  onHover,
}: {
  project: Project;
  commentCount: number;
  density: CardDensity;
  saved: boolean;
  /** In the place the map is on but out of its view: muted until hovered. */
  offMap?: boolean;
  /** What is new since the user last opened it, for projects they have. */
  news?: ProjectNews;
  onOpen: (id: string, section?: Section) => void;
  onSave: (id: string) => void;
  /** Pointer or keyboard focus entering (true) or leaving the card. */
  onHover?: (id: string, hovering: boolean) => void;
}) {
  const updates = getProjectUpdates(project);
  const expanded = density === "expanded";
  const fresh = news && unreadCount(news) > 0 ? news : undefined;
  const title = (
    <h2
      className={cn(
        "mt-1 text-item leading-5.5 text-pretty text-ink",
        wrapTitle,
      )}
    >
      {/* Stretched over the whole card; other controls sit above it. */}
      <button
        type="button"
        className={cn(
          "text-left outline-none",
          "after:absolute after:inset-x-[-12px] after:rounded-xl max-md:after:inset-x-[-8px]",
          reach,
          "focus-visible:after:outline-2 focus-visible:after:outline-focus",
        )}
        aria-label={`${project.title} · ${project.city}${fresh ? ` · ${unreadSummary(fresh)}` : ""}`}
        data-press=""
        // Whole, when the title is cut short.
        data-tooltip={project.title}
        data-tooltip-delay="long"
        onClick={() => onOpen(project.id)}
      >
        {/* Compact: beside the photo, up to three lines, then an ellipsis;
            in a narrow sidebar, two in either view. */}
        <span
          className={cn(
            expanded ? undefined : "line-clamp-3",
            "narrow:line-clamp-2",
          )}
          data-tooltip-clip=""
        >
          {project.title}
        </span>
      </button>
    </h2>
  );
  const status = (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <i
        className={cn(
          "size-2 shrink-0 rounded-full",
          statusTone[project.status].dot,
        )}
      />
      {statuses[project.status].label}
      {finishYear(project) && <span>· {finishYear(project)}</span>}
    </span>
  );
  const commentWord = commentCount === 1 ? "kommentar" : "kommentarer";
  const commentLabel = `${commentCount} ${commentWord}`;
  const updatesTooltip =
    updates.length > 0
      ? `${updates.length} ${updates.length === 1 ? "oppdatering" : "oppdateringer"} · sist ${formatDate(updates[0].date)}`
      : undefined;

  return (
    <li
      className={cn(
        // The same padding in both densities, so the place and title stay
        // put when switching.
        "relative isolate border-b border-border py-4 max-md:py-3.5",
        !expanded && "flex items-center gap-4 max-md:gap-3",
        // Hover wash bleeds slightly past the text edge, like a list row.
        // Instant, so moving down the list reads as a pointer, not a fade.
        "before:absolute before:inset-x-[-12px] before:-z-1 before:rounded-xl max-md:before:inset-x-[-8px]",
        wash,
        "hover:before:bg-surface-muted/65",
        offMap && [
          "opacity-60 transition-opacity duration-120 hover:opacity-100 focus-within:opacity-100",
          "dark:opacity-50 dark:hover:opacity-100 dark:focus-within:opacity-100",
          // Out of sight, these rows skip paint and hit tests: a place can
          // list many more of them than the map shows. The margin keeps the
          // hover wash, which bleeds past the row, from being clipped.
          "[content-visibility:auto] [overflow-clip-margin:12px]",
          expanded
            ? "[contain-intrinsic-size:auto_440px]"
            : "[contain-intrinsic-size:auto_105px]",
        ],
      )}
      data-card-id={project.id}
      data-off-map={offMap || undefined}
      data-density={density}
      data-unread={fresh ? true : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHover?.(project.id, true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onHover?.(project.id, false);
      }}
      // From the keyboard only: a tap focuses the card too.
      onFocus={(event) => {
        if (keyboardFocused(event.target)) onHover?.(project.id, true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          onHover?.(project.id, false);
      }}
    >
      {/* The photos of both views stay mounted, hidden in the other, so
          switching shows them as they were rather than loading them anew. */}
      {expanded && (
        <Fragment key="head">
          {/* Where, then where it stands. */}
          <p className={cn(meta, "gap-1")}>
            <Place project={project} />
            <span className="ml-auto flex shrink-0 pl-2">{status}</span>
          </p>
          {title}
          {project.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink-soft">
              {project.description.split("\n")[0]}
            </p>
          )}
        </Fragment>
      )}
      {!expanded && (
        <div key="text" className="min-w-0 flex-1">
          <p className={cn(meta, "gap-1")}>
            <Place project={project} />
            {/* The place gives way, so this fits at any width. */}
            {fresh && <UnreadMark news={fresh} className="ml-auto pl-2" />}
          </p>
          {title}
          {/* Stats sit above the card link for their tooltips; forward clicks. */}
          <div
            className={cn(meta, "mt-1 cursor-pointer gap-x-3.5 max-md:gap-x-3")}
            data-press=""
            onClick={() => onOpen(project.id)}
          >
            {status}
            <span className={cardStat} data-tooltip={commentLabel}>
              <MessageCircle size={13} aria-hidden="true" />
              {commentCount}
              <span className="sr-only">{` ${commentWord}`}</span>
            </span>
            {updates.length > 0 && (
              <span className={cardStat} data-tooltip={updatesTooltip}>
                <Megaphone size={13} aria-hidden="true" />
                {updates.length}
                <span className="sr-only"> oppdateringer</span>
              </span>
            )}
          </div>
        </div>
      )}
      <Photos
        key="photos"
        project={project}
        onOpen={onOpen}
        hidden={!expanded}
      />
      {expanded && (
        <div key="actions" className="mt-3 flex items-center gap-4">
          <button
            type="button"
            className={action}
            aria-label={commentLabel}
            data-press=""
            // Named here, or in its tooltip where the word gives way.
            data-tooltip={commentLabel}
            onClick={() => onOpen(project.id, "discussion")}
          >
            <MessageCircle size={15} aria-hidden="true" />
            <span>
              {commentCount}
              <span
                className="max-[359px]:hidden narrow:hidden"
                data-tooltip-label=""
              >{` ${commentWord}`}</span>
            </span>
          </button>
          {updates.length > 0 && (
            <button
              type="button"
              className={action}
              aria-label={updatesTooltip}
              data-tooltip={updatesTooltip}
              data-press=""
              onClick={() => onOpen(project.id, "updates")}
            >
              <Megaphone size={15} aria-hidden="true" />
              <span>
                {updates.length}
                <span className="max-[359px]:hidden narrow:hidden">
                  {updates.length === 1 ? " oppdatering" : " oppdateringer"}
                </span>
              </span>
            </button>
          )}
          {fresh && <UnreadMark news={fresh} className="text-ui" />}
          <button
            type="button"
            className={cn(
              action,
              "ml-auto",
              saved && "text-accent hover:text-accent-strong",
            )}
            aria-pressed={saved}
            data-save=""
            data-press=""
            data-tooltip={saved ? "Fjern fra lagrede" : undefined}
            onClick={() => onSave(project.id)}
          >
            <Bookmark
              size={15}
              fill={saved ? "currentColor" : "none"}
              aria-hidden="true"
            />
            {saved ? "Lagret" : "Lagre"}
          </button>
        </div>
      )}
      {/* As tall as the text beside it, at 4:3. */}
      {hasPhoto(project) && (
        <div
          key="thumb"
          className={cn(
            "relative h-16.5 w-22 shrink-0 overflow-hidden rounded-lg bg-surface-muted",
            expanded && "hidden",
          )}
        >
          <Image
            src={project.image}
            alt=""
            fill
            sizes={thumbSizes}
            // Small, so loaded while hidden too, ready for the compact view;
            // painted with the frame it shows in, not a frame after.
            loading="eager"
            fetchPriority="low"
            decoding="sync"
            className="object-cover"
          />
        </div>
      )}
    </li>
  );
});

/** Expanded: every photo, full width; nothing when the project has none. */
function Photos({
  project,
  onOpen,
  hidden,
}: {
  project: Project;
  onOpen: (id: string) => void;
  /** Kept mounted in the compact view, so expanding shows them at once. */
  hidden: boolean;
}) {
  const photos = projectPhotos(project);
  if (photos.length === 0) return null;
  return (
    // Above the card link, so the photos page; a press opens the project.
    <div className="relative z-1 mt-3" hidden={hidden}>
      <ImageGallery
        images={photos}
        label={`Bilder av ${project.title}`}
        // As in the project's own gallery, so opening it reuses the file.
        sizes="(max-width: 768px) 100vw, 560px"
        className="aspect-3/2 rounded-lg"
        decoding="sync"
        onPress={() => onOpen(project.id)}
      />
    </div>
  );
}
