import { memo, type ReactNode } from "react";
import { Megaphone, MessageCircle, Plus, type LucideIcon } from "lucide-react";
import type { Project } from "../lib/data";
import type { ProjectActivity } from "../lib/community";
import { eventTime, latestEvent, type ProjectEvent } from "../lib/project-events";
import { type ProjectNews, unreadCount, unreadSummary } from "../lib/unread";
import { cn } from "../lib/cn";
import { keyboardFocused } from "../lib/ui";
import RelativeTime from "./relative-time";

export type FeedEntry = { project: Project; event: ProjectEvent };

/** Projects by what last happened on them, newest first. */
export function feedEntries(
  projects: Project[],
  activity: Record<string, ProjectActivity>,
): FeedEntry[] {
  return projects
    .map((project) => ({
      project,
      event: latestEvent(project, activity[project.id]),
    }))
    .sort((a, b) => eventTime(b.event) - eventTime(a.event));
}

/** Where a row opens its project: at the update or comment it shows. */
export type FeedTarget = { updateId?: string; commentId?: string };

const firstParagraph = (text: string) => text.split("\n")[0].trim();

// A wash behind what's pressed, reaching a little past the text.
const wash =
  "before:absolute before:inset-x-[-12px] before:-z-1 before:rounded-xl max-md:before:inset-x-[-8px]";

/**
 * One happening, the way a comment reads in a thread: a symbol where the
 * avatar would be, then who or what and when on the first line, the words
 * under it, indented past the symbol.
 */
function Entry({
  icon: Icon,
  head,
  date,
  fresh,
  children,
}: {
  icon: LucideIcon;
  head: ReactNode;
  date: string;
  /** Marks the newest happening while it's unread. */
  fresh?: boolean;
  children?: ReactNode;
}) {
  // Spans only: it sits inside a button when comments are grouped.
  return (
    <span className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-2.5 text-left">
      <Icon size={14} className="mt-0.75 text-muted" aria-hidden="true" />
      <span className="flex min-w-0 items-baseline gap-1.5 text-ui leading-5">
        <span className="min-w-0 truncate font-medium text-ink">{head}</span>
        <span className="shrink-0 text-xs text-muted" aria-hidden="true">
          ·
        </span>
        <RelativeTime
          date={date}
          className="shrink-0 text-xs whitespace-nowrap text-muted"
        />
        {fresh && (
          <i
            className="size-1.5 shrink-0 self-center rounded-full bg-accent"
            data-unread-mark=""
            aria-hidden="true"
          />
        )}
      </span>
      {children && (
        <span className="col-start-2 mt-0.5 line-clamp-2 text-sm leading-5 wrap-anywhere text-ink-soft">
          {children}
        </span>
      )}
    </span>
  );
}

/**
 * One project in the "Nytt" view: the project quietly on top, then what
 * happened on it. Comments within a week of the newest gather under it,
 * each opening the project at itself.
 */
export const FeedRow = memo(function FeedRow({
  entry: { project, event },
  news,
  onOpen,
  onHover,
}: {
  entry: FeedEntry;
  news?: ProjectNews;
  onOpen: (id: string, target: FeedTarget) => void;
  onHover?: (id: string, hovering: boolean) => void;
}) {
  const fresh = news && unreadCount(news) > 0 ? news : undefined;
  const unread = fresh ? `, ${unreadSummary(fresh)} siden sist` : "";
  const grouped = event.kind === "comment" && event.comments.length > 1;
  const target: FeedTarget =
    event.kind === "update"
      ? { updateId: event.updateId }
      : event.kind === "comment"
        ? { commentId: event.comments[0].id }
        : {};
  const label =
    event.kind === "update"
      ? `${project.title}: oppdatering, ${event.title}`
      : event.kind === "comment"
        ? `${project.title}: ${event.comments.length + event.more} ${event.comments.length + event.more === 1 ? "ny kommentar" : "nye kommentarer"}, sist fra ${event.comments[0].author}`
        : `Nytt prosjekt: ${project.title}`;
  return (
    <li
      className={cn(
        "relative isolate border-b border-border py-3.5",
        // A single happening is one press; grouped, each comment is its own.
        !grouped && [wash, "before:inset-y-1.5 hover:before:bg-ink/[0.05] pointer-coarse:active:before:bg-ink/[0.05] dark:hover:before:bg-surface-muted/65 dark:pointer-coarse:active:before:bg-surface-muted/65"],
      )}
      data-feed-id={project.id}
      data-event={event.kind}
      data-unread={fresh ? true : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onHover?.(project.id, true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onHover?.(project.id, false);
      }}
      onFocus={(e) => {
        if (keyboardFocused(e.target)) onHover?.(project.id, true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget))
          onHover?.(project.id, false);
      }}
    >
      {!grouped && (
        <button
          type="button"
          className={cn(
            "absolute inset-x-[-12px] inset-y-1.5 z-1 rounded-xl outline-none max-md:inset-x-[-8px]",
            "focus-visible:outline-2 focus-visible:outline-focus",
          )}
          aria-label={`${label}${unread}`}
          data-press=""
          onClick={() => onOpen(project.id, target)}
        />
      )}
      {/* A new project is itself the news; others name it on top. */}
      {event.kind !== "added" && (
        <p
          className="mb-2 truncate text-xs leading-4 text-muted"
          data-feed-context=""
        >
          {project.title}
        </p>
      )}
      {event.kind === "update" ? (
        <div aria-hidden="true">
          <Entry
            icon={Megaphone}
            head={event.title}
            date={event.date}
            fresh={!!fresh}
          >
            {firstParagraph(event.body)}
          </Entry>
        </div>
      ) : event.kind === "comment" ? (
        <ul className={grouped ? "space-y-1" : undefined}>
          {event.comments.map((comment, index) => (
            <li key={comment.id} className="relative isolate">
              {grouped ? (
                <button
                  type="button"
                  className={cn(
                    "block w-full outline-none",
                    wash,
                    "before:-inset-y-1.5 hover:before:bg-ink/[0.05] pointer-coarse:active:before:bg-ink/[0.05] dark:hover:before:bg-surface-muted/65 dark:pointer-coarse:active:before:bg-surface-muted/65",
                    "after:absolute after:inset-x-[-12px] after:-inset-y-1.5 after:rounded-xl max-md:after:inset-x-[-8px] focus-visible:after:outline-2 focus-visible:after:outline-focus",
                  )}
                  aria-label={`${project.title}: kommentar fra ${comment.author}${index === 0 ? unread : ""}`}
                  data-press=""
                  data-feed-comment={comment.id}
                  onClick={() =>
                    onOpen(project.id, { commentId: comment.id })
                  }
                >
                  <Entry
                    icon={MessageCircle}
                    head={comment.author}
                    date={comment.date}
                    fresh={index === 0 && !!fresh}
                  >
                    {comment.text}
                  </Entry>
                </button>
              ) : (
                <div aria-hidden="true">
                  <Entry
                    icon={MessageCircle}
                    head={comment.author}
                    date={comment.date}
                    fresh={!!fresh}
                  >
                    {comment.text}
                  </Entry>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div aria-hidden="true">
          <Entry
            icon={Plus}
            head={project.title}
            date={event.date}
            fresh={!!fresh}
          >
            {firstParagraph(project.description)}
          </Entry>
        </div>
      )}
      {event.kind === "comment" && event.more > 0 && (
        <p className="mt-1.5 pl-6 text-xs leading-4 text-muted" aria-hidden="true">
          {event.more === 1 ? "1 kommentar til" : `${event.more} kommentarer til`}
        </p>
      )}
    </li>
  );
});
