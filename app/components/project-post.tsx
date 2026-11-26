"use client";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  ArrowUp,
  ArrowUpRight,
  ImagePlus,
  Megaphone,
  ChevronDown,
  MessageCircle,
  LoaderCircle,
  MessagesSquare,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  dismissSuggestHint,
  storedSuggestHintDismissed,
  subscribeSuggestHint,
} from "../lib/explore-state";
import {
  arrangePhotos,
  getProjectUpdates,
  type Project,
  projectHref,
  hasPhoto,
  projectPhotos,
  projectPlace,
  type Status,
  statuses,
  statusOrder,
  ownPhotos,
  unknownDeveloper,
} from "../lib/data";
import { applyChanges } from "../lib/suggestions";
import { useAuth } from "./auth-provider";
import { useComments, useCommunity } from "./community-provider";
import { projectComments } from "../lib/community";
import { errorMessage } from "../lib/api-client";
import { cn } from "../lib/cn";
import { reducedMotion } from "../lib/media";
import {
  composer,
  composerField,
  composerSend,
  dangerButton,
  pillButton,
  secondaryButton,
  statusTone,
} from "../lib/ui";
import DrawingMap from "./drawing-map";
import ProjectPostHeader from "./project-post-header";
import Dialog from "./dialog";
import ActionSheet from "./action-sheet";
import ProjectDiscussion, { DiscussionSortSelect } from "./project-discussion";
import type { DiscussionSort } from "../lib/discussion";
import CategoryPicker from "./category-picker";
import PlacePicker from "./place-picker";
import RelativeTime from "./relative-time";
import PhaseTimeline from "./phase-timeline";
import TimelineInput from "./timeline-input";
import { usePanelExpand } from "./panel";
import Link from "next/link";
import { profileHref } from "../lib/profiles";
import { openProfile } from "../lib/profile-overlay";
import {
  changedFields,
  changesToSave,
  EditBar,
  EditField,
  editInput,
  editState,
  type EditStage,
  type FieldId,
  fields,
  ProjectEditContext,
  toDraft,
  useProjectEdit,
} from "./project-edit";
import EmptyState, { EmptyAction } from "./empty-state";
import ImageGallery from "./image-gallery";
import ImagePicker from "./image-picker";
import styles from "./project-post.module.css";
import { takeLoginIntent } from "../lib/login-intent";

const cover =
  "relative aspect-3/2 w-full overflow-hidden rounded-xl bg-surface-muted";
/**
 * "Les mer" / "Skjul kommentarer": sticks to the bottom (when `sticky`) and
 * becomes a floating pill while stuck.
 */
const stickyToggle = cn(
  "bottom-3 z-2 mx-auto mt-1 mb-0.5 flex min-h-9 items-center gap-1 rounded-full border border-transparent pr-3 pl-3.5",
  "text-ui font-medium text-ink transition-[background-color,border-color,box-shadow] duration-150 not-data-moving:hover:bg-ink/[0.05]",
  // While it slides into place, it turns into the pill over the same stretch, without the hover
  // tint left from the tap that moved it.
  "data-moving:duration-320 data-moving:ease-out-soft",
  "data-[stuck=true]:border-border data-[stuck=true]:bg-surface data-[stuck=true]:shadow-float",
  "[&>svg]:text-muted [&>svg]:transition-transform [&>svg]:duration-240 motion-reduce:[&>svg]:transition-none",
);
/** Plain text actions under each update; the comments toggle leads. */
const updateAction = cn(
  "inline-flex min-h-8.5 items-center gap-1.5 text-ui font-medium text-ink underline-offset-4",
  "hover:[&>span]:underline [&>svg]:shrink-0 [&>svg]:text-muted max-sm:min-h-10",
);
const composerTool = cn(
  "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs leading-normal font-medium text-muted",
  "transition-colors duration-120 hover:bg-ink/[0.05] hover:text-ink focus-within:bg-ink/[0.05] focus-within:text-ink",
  "aria-expanded:bg-ink/[0.05] aria-expanded:text-ink",
);
type Props = {
  project: Project;
  initialUpdateId?: string;
  /** Opens the discussion at this comment. */
  initialCommentId?: string;
  /** Opens scrolled to this tab, as from a card's comment or update count. */
  initialSection?: "discussion" | "updates";
  /** Desktop panel: Escape closes it (the mobile drawer handles its own). */
  closeOnEscape?: boolean;
  onClose: () => void;
  feedback?: ReactNode;
  saved: boolean;
  onSave: () => void;
  /** Phones: the header's actions sit in a sheet. */
  mobile?: boolean;
  onNotify: (message: string) => void;
};
/** A suggester's username, quietly linked to their profile. */
function Credit({ username }: { username: string }) {
  return (
    <Link
      href={profileHref(username)}
      className="text-muted underline-offset-3 hover:text-ink hover:underline"
      onClick={(event) => {
        // Plain clicks open the profile over the project, like comments do.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button)
          return;
        event.preventDefault();
        openProfile(username);
      }}
    >
      @{username}
    </Link>
  );
}

/** Edit mode: every fact as a field, then the outline on a small map. */
function EditFacts() {
  const edit = useProjectEdit();
  if (!edit) return null;
  const { draft, change } = edit;
  return (
    // Short fields pair up; place, link and map take the full width.
    <div className="mt-5 grid grid-cols-2 gap-4 max-xs:grid-cols-1">
      <EditField id="timeline" wide>
        <TimelineInput
          draft={draft}
          change={change}
          idPrefix={`edit-${draft.id}`}
        />
      </EditField>
      <EditField id="categories" wide>
        <CategoryPicker
          triggerClassName={cn(
            editState,
            "min-h-9 rounded-lg border-border-strong px-2.5 pointer-coarse:min-h-11 max-sm:text-base",
          )}
          value={draft.categories}
          onChange={(categories) => change({ categories })}
        />
      </EditField>
      <EditField id="developer" wide>
        <input
          className={editInput}
          aria-label="Byggherre"
          placeholder={unknownDeveloper}
          maxLength={100}
          value={draft.developer}
          onChange={(event) => change({ developer: event.target.value })}
        />
      </EditField>
      <EditField id="place" wide>
        <div className="grid grid-cols-2 gap-1.5">
          <PlacePicker
            className={editInput}
            aria-label="Sted"
            value={draft.city}
            onChange={(city) => change({ city })}
          />
          <input
            className={editInput}
            aria-label="Område / bydel"
            placeholder="Bydel"
            maxLength={80}
            value={draft.district}
            onChange={(event) => change({ district: event.target.value })}
          />
        </div>
      </EditField>
      <EditField id="website" wide>
        <input
          className={editInput}
          aria-label="Prosjektlenke"
          type="url"
          maxLength={2000}
          placeholder="https://…"
          value={draft.website || ""}
          onChange={(event) => change({ website: event.target.value })}
        />
      </EditField>
      <EditField id="geometry" wide>
        <DrawingMap
          city={draft.city.trim() || draft.city}
          compact
          frameClassName={editState}
          points={draft.geometry}
          shape={draft.geometryType}
          onShapeChange={(geometryType) => change({ geometryType })}
          onPointsChange={(geometry) => change({ geometry })}
        />
      </EditField>
    </div>
  );
}

function EditDescription() {
  const edit = useProjectEdit();
  if (!edit) return null;
  return (
    <EditField id="description">
      <textarea
        className={cn(
          editInput,
          "field-sizing-content min-h-32 resize-none px-3 py-2 text-body leading-[1.65] max-sm:text-base",
        )}
        aria-label="Beskrivelse"
        maxLength={10000}
        value={edit.draft.description}
        onChange={(event) => edit.change({ description: event.target.value })}
      />
    </EditField>
  );
}

/** Edit mode: the project's own photos, cover first. */
function EditImages() {
  const edit = useProjectEdit();
  if (!edit) return null;
  const { original, change, onUploading } = edit;
  return (
    <EditField id="images" className="mt-5">
      <ImagePicker
        cover
        max={21}
        pasteScope="[data-project-post]"
        value={ownPhotos(edit.draft).map((photo) => photo.src)}
        onChange={(update) =>
          change((draft) =>
            arrangePhotos(
              original,
              update(ownPhotos(draft).map((photo) => photo.src)),
            ),
          )
        }
        onBusy={onUploading}
      />
    </EditField>
  );
}

function CommentsLoading() {
  return (
    <p role="status" className="flex min-h-32 items-center justify-center text-muted">
      <LoaderCircle
        size={20}
        className="animate-spin motion-reduce:animate-none"
        aria-label="Henter kommentarer"
      />
    </p>
  );
}

const stickyGap = 12;

/** Whether a sticky toggle's own spot, marked by `marker`, is below the fold. */
function pastFold(marker: Element, scroller: Element) {
  return (
    marker.getBoundingClientRect().top >
    scroller.getBoundingClientRect().bottom - stickyGap
  );
}

/**
 * Runs `check` now and again once whatever animates `marker` into place
 * has finished. Measured mid-slide, it still sits where it started, which
 * would leave a sticky toggle unstuck until the next scroll. Returns a
 * cancel function.
 */
function whenSettled(marker: Element, check: () => void) {
  let cancelled = false;
  const frame = requestAnimationFrame(() => {
    const running = marker
      .getAnimations({ subtree: false })
      .concat(marker.parentElement?.getAnimations() ?? []);
    check();
    void Promise.allSettled(running.map((a) => a.finished)).then(() => {
      if (!cancelled) check();
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

const introMotion: KeyframeAnimationOptions = {
  duration: 320,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

/** What is laid out after `node` within `root`, and so moves as it grows. */
function laterElements(node: Element, root: Element) {
  const later: HTMLElement[] = [];
  for (let el: Element | null = node; el && el !== root; el = el.parentElement)
    for (let next = el.nextElementSibling; next; next = next.nextElementSibling)
      if (next instanceof HTMLElement) later.push(next);
  return later;
}

/**
 * Plays a change in the size of `parts` without laying out every frame.
 * `change` applies the end layout in one go; then what it moved slides back
 * from where it was, and each part's clip eases from its old height to its
 * new one. Only transforms and clips animate, so the post below the intro
 * (images, updates, discussion) is laid out once rather than 20 times.
 * When `change` scrolls, `frame`, which holds the rest, slides back too, so
 * the scroll eases on the same timing rather than adding a second motion.
 */
function morph(
  parts: HTMLElement[],
  movers: HTMLElement[],
  change: () => void,
  frame?: HTMLElement,
): Animation[] {
  const all = [...parts, ...movers];
  // Whole-pixel offsetHeight would leave the clips a fraction off.
  const before = all.map((el) => el.getBoundingClientRect());
  const frameTop = frame?.getBoundingClientRect().top ?? 0;
  change();
  const animations: Animation[] = [];
  // Started first, so what the frame holds is measured from its start.
  const scrolled = frame ? frameTop - frame.getBoundingClientRect().top : 0;
  if (frame && Math.abs(scrolled) >= 0.5)
    animations.push(
      frame.animate(
        [
          { transform: `translateY(${scrolled}px)` },
          { transform: "translateY(0)" },
        ],
        introMotion,
      ),
    );
  all.forEach((el, i) => {
    const dy = before[i].top - el.getBoundingClientRect().top;
    // A part's clip runs from its old height to its new one: inside its new
    // box when it grows, past it (a negative inset) when it shrinks. A part
    // can keep its box and give up the space with a negative margin instead.
    const box = el.getBoundingClientRect().height;
    const height = box + (parseFloat(el.style.marginBottom) || 0);
    const inset = i < parts.length ? box - before[i].height : 0;
    const end = i < parts.length ? box - height : 0;
    if (Math.abs(dy) < 0.5 && Math.abs(inset - end) < 0.5) return;
    const from: Keyframe = { transform: `translateY(${dy}px)` };
    const to: Keyframe = { transform: "translateY(0)" };
    if (i < parts.length) {
      from.clipPath = `inset(0 0 ${inset}px 0)`;
      to.clipPath = `inset(0 0 ${end}px 0)`;
    }
    animations.push(el.animate([from, to], introMotion));
  });
  return animations;
}

/**
 * Where it is, who builds it and its site, then how far along it is, at a
 * glance under the title.
 */
function ProjectMeta({ project }: { project: Project }) {
  const developer =
    project.developer !== unknownDeveloper ? project.developer : "";
  return (
    <div className="mb-3" data-project-meta="">
      {/* Each separator hangs in the space before its item, and the row is
          clipped at its start, so a line that wraps never begins with one. */}
      <div className="-mt-1 -ml-1 overflow-x-clip pl-1">
        <p className="-ml-4 flex flex-wrap items-center gap-y-1 text-ui leading-normal text-muted max-md:text-xs [&>*]:inline-flex [&>*]:min-w-0 [&>*]:items-center [&>*]:before:w-4 [&>*]:before:shrink-0 [&>*]:before:text-center [&>*]:before:content-['·']">
          <span>{projectPlace(project)}</span>
          {developer && (
            <span data-tooltip="Byggherre">
              <span className="sr-only">Byggherre: </span>
              {developer}
            </span>
          )}
          {project.website && (
            <span>
              <a
                href={project.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-ink underline decoration-border-strong decoration-1 underline-offset-3 transition-[text-decoration-color] duration-120 hover:decoration-current"
              >
                Nettside
                <ArrowUpRight size={14} aria-hidden="true" className="shrink-0" />
              </a>
            </span>
          )}
        </p>
      </div>
      <PhaseTimeline project={project} className="mt-5 max-md:mt-4" />
    </div>
  );
}

const noDismissed: string[] = [];

/**
 * "Ser du noe som er feil eller mangler? Foreslå endring", under a
 * project's intro, until its ✕ closes it for that project in this browser.
 */
function SuggestChangeHint({
  projectId,
  onSuggest,
}: {
  projectId: string;
  onSuggest: () => void;
}) {
  const dismissed = useSyncExternalStore(
    subscribeSuggestHint,
    storedSuggestHintDismissed,
    () => noDismissed,
  );
  if (dismissed.includes(projectId)) return null;
  return (
    <div
      className="mt-4 mb-1 flex items-center gap-2 text-xs leading-4.5 text-muted"
      data-suggest-change=""
    >
      <p className="min-w-0 flex-1">
        Ser du noe som er feil eller mangler?{" "}
        <button
          type="button"
          className="relative font-medium text-ink underline decoration-border-strong decoration-1 underline-offset-3 transition-[text-decoration-color] duration-120 hover:decoration-current pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
          onClick={onSuggest}
        >
          Foreslå endring
        </button>
      </p>
      <button
        type="button"
        className="-my-1.5 -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-ink/[0.06] hover:text-ink pointer-coarse:size-9"
        aria-label="Skjul forslag om endring"
        data-tooltip="Skjul"
        data-press=""
        onClick={() => dismissSuggestHint(projectId)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

const noSubscription = () => () => {};

/**
 * What the tabs hold, under the fold as a project opens: it follows the
 * panel in, rendered in the background once its top is up. The page's own
 * render has it at once, as does a panel opened at an update, a comment or
 * the tabs.
 */
function BelowTabs({
  now,
  children,
  ...props
}: ComponentProps<"div"> & { now: boolean }) {
  const hydrating = useSyncExternalStore(
    noSubscription,
    () => false,
    () => true,
  );
  const shown = useDeferredValue(true, now || hydrating);
  return <div {...props}>{shown && children}</div>;
}

/** The description's paragraphs; none when it's empty. */
const paragraphs = (text: string) => text.split("\n\n").filter(Boolean);

/**
 * A few lines of the description, then "Les mer" and the image (more lines on desktop). "Les mer"
 * grows the text, pushing the image down; a description that fits has none.
 */
function ProjectIntro({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  // The ellipsis clamp lifts before expanding and returns after collapsing.
  const [clamped, setClamped] = useState(true);
  const [stuck, setStuck] = useState(false);
  // Expanding or collapsing: the toggle slides with the text.
  const [moving, setMoving] = useState(false);
  // Without a photo, three lines show and fade out instead of an ellipsis.
  const photos = projectPhotos(project);
  const photo = photos.length > 0;
  // Whether the clamped text hides any of it, and so needs "Les mer".
  const [overflows, setOverflows] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // On a phone resting at the middle height, reading on takes the full height.
  const expandPanel = usePanelExpand();
  // The running change: its animations and the step that ends it.
  const running = useRef<{ animations: Animation[]; done: () => void }>(null);
  // Dragged down from the full height, the text folds back as "Vis mindre" would.
  const full = expandPanel === null;
  const wasFull = useRef(full);
  const fold = useEffectEvent(() => {
    if (open) toggle();
  });
  useEffect(() => {
    // Out of React's commit, since the fold flushes its own renders.
    if (wasFull.current && !full) queueMicrotask(fold);
    wasFull.current = full;
  }, [full]);

  useLayoutEffect(() => {
    const copy = text.current;
    if (!copy || !clamped) return;
    const measure = () =>
      setOverflows(copy.scrollHeight > copy.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [clamped]);

  // While expanded, the toggle sticks to the bottom until its own spot scrolls in.
  useEffect(() => {
    const marker = end.current;
    const scroller = marker?.closest("[data-project-scroll]");
    if (!open || !marker || !scroller) return;
    // Mid-slide the marker still sits where it started. The toggle already
    // set where it lands, and this checks again once it settles.
    const update = () => {
      if (marker.getAnimations().length === 0)
        setStuck(pastFold(marker, scroller));
    };
    // Re-check as the intro or the view resizes.
    const resize = new ResizeObserver(update);
    resize.observe(scroller);
    if (body.current) resize.observe(body.current);
    scroller.addEventListener("scroll", update, { passive: true });
    const settled = whenSettled(marker, update);
    return () => {
      settled();
      resize.disconnect();
      scroller.removeEventListener("scroll", update);
      setStuck(false);
    };
  }, [open]);

  function toggle() {
    const copy = text.current;
    const intro = body.current;
    const scroller = intro?.closest<HTMLElement>("[data-project-scroll]");
    if (!copy || !intro || !scroller) return;
    // A second tap lands the first change before starting the next.
    const last = running.current;
    if (last) {
      running.current = null;
      last.animations.forEach((animation) => animation.cancel());
      last.done();
    }
    const still = reducedMotion();
    if (!open) expandPanel?.();
    if (still) {
      // Collapsing returns to the top, so reading resumes from the start.
      if (open) scroller.scrollTop = 0;
      flushSync(() => {
        setOpen(!open);
        setClamped(open);
      });
      return;
    }
    const parts = [copy];
    // The toggle, the image and the rest of the post.
    const movers = laterElements(intro, scroller);
    const reset = () => {
      flushSync(() => setMoving(false));
      for (const el of parts) {
        el.style.height = "";
        el.style.marginBottom = "";
        el.style.overflow = "";
      }
      scroller.style.overflowAnchor = "";
    };
    // Scroll anchoring would shift the post under the animation.
    scroller.style.overflowAnchor = "none";
    const copyHeight = copy.getBoundingClientRect().height;
    let animations: Animation[];
    let done: () => void;
    if (open) {
      // The text keeps its full layout under a clip until it can clamp. Its
      // box stays whole too, so the fade's mask still covers every line.
      // Where it lands is measured clamped, paragraph gaps and all.
      copy.dataset.clamped = "true";
      const target = copy.getBoundingClientRect().height;
      copy.dataset.clamped = "false";
      // Collapsing returns to the top, so reading resumes from the start. The
      // jump there plays as part of the slide.
      const frame = [...scroller.children].find((child) =>
        child.contains(intro),
      ) as HTMLElement | undefined;
      animations = morph(
        parts,
        movers,
        () => {
          copy.style.marginBottom = `${target - copyHeight}px`;
          for (const el of parts) el.style.overflow = "visible";
          flushSync(() => {
            setOpen(false);
            setStuck(false);
            setMoving(true);
          });
          scroller.scrollTop = 0;
        },
        frame,
      );
      // Clamped in the same frame the inline height goes, so nothing flashes.
      done = () => {
        flushSync(() => setClamped(true));
        reset();
      };
    } else {
      animations = morph(parts, movers, () => {
        flushSync(() => {
          setClamped(false);
          setOpen(true);
          setMoving(true);
        });
        // Laid out where it lands, so the pill forms as the toggle slides
        // there rather than after.
        const marker = end.current;
        if (marker) flushSync(() => setStuck(pastFold(marker, scroller)));
      });
      done = reset;
    }
    // The fade's mask follows the clip, so the fade sits on the visible edge.
    if (!photo) {
      animations.push(
        copy.animate(
          {
            maskSize: [
              `100% ${copyHeight}px`,
              `100% ${copy.getBoundingClientRect().height + (parseFloat(copy.style.marginBottom) || 0)}px`,
            ],
          },
          introMotion,
        ),
      );
    }
    const change = { animations, done };
    running.current = change;
    Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (running.current !== change) return;
        running.current = null;
        done();
      },
      // Cancelled: a newer change, or the post closed, took over.
      () => {},
    );
  }
  return (
    <div data-project-header-hero="">
      <div ref={body} id={`intro-${project.id}`}>
        <div
          ref={text}
          className={styles.introText}
          data-clamped={clamped}
          data-expanded={open}
          data-photo={photo}
          data-overflows={overflows}
        >
          {paragraphs(project.description).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
      {(overflows || open) && (
        <button
          type="button"
          className={cn(
            stickyToggle,
            "my-0.5",
            open && "sticky",
            "aria-expanded:[&>svg]:rotate-180",
          )}
          data-stuck={stuck}
          data-moving={moving || undefined}
          aria-expanded={open}
          aria-controls={`intro-${project.id}`}
          onClick={toggle}
        >
          {open ? "Vis mindre" : "Les mer"}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
      <div ref={end} aria-hidden="true" />
      {photo && (
        <ImageGallery
          images={photos}
          label={`Bilder av ${project.title}`}
          sizes="(max-width: 768px) 100vw, 560px"
          // Without "Les mer" between them, more room under the text.
          className={cn(cover, overflows || open ? "mt-2" : "mt-4")}
          // Led by the cover the list shows a thumbnail of.
          cover={hasPhoto(project)}
        />
      )}
    </div>
  );
}

/**
 * Mobile "Skjul kommentarer" at the end of an update's comment section. Like
 * the intro's "Vis mindre", it sticks to the bottom until its spot scrolls in.
 */
function CommentsDock({
  id,
  open,
  onClose,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
}) {
  const [stuck, setStuck] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = button.current?.closest<HTMLElement>(
      "[data-update-comments]",
    );
    const scroller = section?.closest("[data-project-scroll]");
    if (!open || !section || !scroller) return;
    const update = () => {
      setStuck(!!end.current && pastFold(end.current, scroller));
    };
    const resize = new ResizeObserver(update);
    resize.observe(scroller);
    resize.observe(section);
    scroller.addEventListener("scroll", update, { passive: true });
    update();
    const settled = end.current ? whenSettled(end.current, update) : () => {};
    return () => {
      settled();
      resize.disconnect();
      scroller.removeEventListener("scroll", update);
    };
  }, [open]);
  function close() {
    const still = reducedMotion();
    flushSync(onClose);
    const toggle = document.querySelector<HTMLElement>(
      `[data-comments-toggle][aria-controls="update-comments-${id}"]`,
    );
    // It stays put while the section below it closes, so scroll back to it.
    toggle?.scrollIntoView({
      block: "center",
      behavior: still ? "auto" : "smooth",
    });
    toggle?.focus({ preventScroll: true });
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className={cn(stickyToggle, "sticky sm:hidden [&>svg]:rotate-180")}
        data-stuck={stuck}
        aria-expanded={open}
        aria-controls={`update-comments-${id}`}
        onClick={close}
      >
        Skjul kommentarer
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div ref={end} aria-hidden="true" />
    </>
  );
}

type Tip = { text: string; sourceUrl: string; image?: string };

/**
 * Moderators publish updates from a composer that opens like the comment one.
 * With `onTip`, members send a tip instead: text and a source, for review.
 */
function UpdateComposer({
  project,
  onUpdate,
  onTip,
  onNotify,
  onPublished,
  empty: noUpdates = false,
}: {
  project: Project;
  onUpdate: (project: Project) => Promise<void>;
  onTip?: (tip: Tip) => Promise<void>;
  onNotify: (message: string) => void;
  onPublished: (id: string) => void;
  /** No updates yet: the pill becomes the empty state's action. */
  empty?: boolean;
}) {
  const { requireLogin, user } = useAuth();
  const tip = Boolean(onTip);
  const [open, setOpen] = useState(false);
  // The pill's width, so the form can grow out of it.
  const [pillWidth, setPillWidth] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<Status>(project.status);
  const [images, setImages] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  // Escape and Avbryt hand focus back to the pill; a blur leaves it be.
  const refocusPill = useRef(false);
  const empty =
    !title.trim() && !body.trim() && !source.trim() && !images.length;
  function reset() {
    setOpen(false);
    setPicking(false);
    setTitle("");
    setBody("");
    setSource("");
    setImages([]);
    setStatus(project.status);
  }
  useEffect(() => {
    if (open)
      (titleRef.current ?? bodyRef.current)?.focus({ preventScroll: true });
    else if (refocusPill.current) pillRef.current?.focus({ preventScroll: true });
    refocusPill.current = false;
  }, [open]);
  function cancel() {
    refocusPill.current = true;
    reset();
  }
  // Back from logging in to send a tip: the composer opens again.
  const member = Boolean(user?.username);
  useEffect(() => {
    if (!tip || !member || !takeLoginIntent("tip", project.id)) return;
    setPillWidth(pillRef.current?.offsetWidth ?? 0);
    setOpen(true);
  }, [tip, member, project.id]);
  const ready = tip
    ? Boolean(body.trim() && source.trim())
    : Boolean(title.trim() && body.trim());
  async function publish(event?: React.FormEvent) {
    event?.preventDefault();
    if (publishing || uploading || !ready) return;
    setPublishing(true);
    try {
      if (onTip) {
        await onTip({
          text: body.trim(),
          sourceUrl: source.trim(),
          image: images[0],
        });
        reset();
        onNotify("Tipset er sendt");
        return;
      }
      const date = new Date().toISOString();
      const id = crypto.randomUUID();
      await onUpdate({
        ...project,
        status,
        updated: date,
        updates: [
          {
            id,
            title: title.trim(),
            body: body.trim(),
            date,
            sourceUrl: source.trim() || undefined,
            images: images.map((src) => ({ src })),
          },
          ...project.updates,
        ],
      });
      reset();
      onPublished(id);
      onNotify("Oppdateringen er publisert");
    } catch (error) {
      onNotify(
        errorMessage(
          error,
          tip
            ? "Kunne ikke sende tipset."
            : "Kunne ikke publisere oppdateringen.",
        ),
      );
    } finally {
      setPublishing(false);
    }
  }
  const send = (
    <button
      type="submit"
      className={composerSend}
      disabled={publishing || uploading || !ready}
      aria-label={tip ? "Send tips" : "Publiser oppdatering"}
    >
      <ArrowUp size={16} strokeWidth={2.25} />
    </button>
  );
  function start(event: React.MouseEvent<HTMLButtonElement>) {
    if (
      tip &&
      !requireLogin("Du må være logget inn for å sende tips.", {
        type: "tip",
        projectId: project.id,
      })
    )
      return;
    setPillWidth(event.currentTarget.offsetWidth);
    setOpen(true);
  }
  const label = tip ? "Send tips" : "Skriv en oppdatering";
  if (!open && noUpdates)
    return (
      <EmptyState
        icon={<Megaphone size={24} />}
        title="Ingen oppdateringer ennå"
      >
        <EmptyAction ref={pillRef} icon={<Plus size={16} />} onClick={start}>
          {label}
        </EmptyAction>
      </EmptyState>
    );
  if (!open)
    return (
      <button
        ref={pillRef}
        type="button"
        className={cn(
          pillButton,
          "mb-6 gap-2 bg-surface pr-4 pl-3 [&>svg]:text-muted",
        )}
        onClick={start}
      >
        <Plus size={16} aria-hidden="true" />
        {label}
      </button>
    );
  return (
    <form
      id="project-update-form"
      className={cn(
        composer,
        "mb-6 flex-col items-stretch gap-0 overflow-hidden rounded-2xl [interpolate-size:allow-keywords]",
        // Grows out of the pill: wider first, then taller.
        "h-auto w-full transition-[width,height,border-radius,border-color,box-shadow,opacity] duration-320 ease-out-soft motion-reduce:transition-none",
        noUpdates
          ? // Opened from the empty state's link: it fades in where that was.
            "starting:opacity-0"
          : "starting:h-10.5 starting:w-(--pill-width) starting:rounded-[22px]",
      )}
      style={{ "--pill-width": `${pillWidth}px` } as React.CSSProperties}
      onSubmit={publish}
      onBlur={(event) => {
        // Closes when focus leaves an untouched composer.
        if (empty && !event.currentTarget.contains(event.relatedTarget))
          reset();
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          void publish();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      {!tip && (
        <input
          ref={titleRef}
          className={cn(composerField, "font-semibold")}
          aria-label="Overskrift"
          placeholder="Overskrift"
          required
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      )}
      {open && (
        <>
          <textarea
            ref={bodyRef}
            className={cn(
              composerField,
              "block max-h-65 min-h-[calc(3lh+10px)] flex-none resize-none field-sizing-content",
            )}
            aria-label={tip ? "Tips" : "Oppdatering"}
            placeholder={tip ? "Tips" : "Hva har skjedd siden sist?"}
            required
            maxLength={tip ? 2000 : 5000}
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <input
            type="url"
            aria-label={tip ? "Kildelenke" : "Kildelenke (valgfritt)"}
            placeholder={tip ? "Kildelenke (https://…)" : "Kildelenke (valgfritt)"}
            required={tip}
            pattern="https://.*"
            maxLength={2000}
            className={composerField}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          {picking && (
            <ImagePicker
              id="update-composer-images"
              className="px-2 pt-1 pb-2"
              value={images}
              onChange={setImages}
              onBusy={setUploading}
              max={tip ? 1 : 10}
            />
          )}
          <div className="mt-1 flex items-center gap-1 border-t border-border pt-1">
            <button
              type="button"
              className={composerTool}
              aria-expanded={picking}
              aria-controls="update-composer-images"
              onClick={() => setPicking(!picking)}
            >
              <ImagePlus size={16} aria-hidden="true" />
              {tip ? "Bilde" : "Bilder"}
              {images.length > 0 && (
                <small className="text-2xs tabular-nums">{images.length}</small>
              )}
            </button>
            <label className={composerTool} hidden={tip}>
              <i
                className={cn("size-2 rounded-full", statusTone[status].dot)}
                aria-hidden="true"
              />
              <span className="sr-only">Prosjektstatus</span>
              <select
                className="cursor-pointer appearance-none bg-transparent outline-none"
                value={status}
                onChange={(event) => setStatus(event.target.value as Status)}
              >
                {statusOrder.map((value) => (
                  <option key={value} value={value}>
                    {statuses[value].label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={cn(composerTool, "ml-auto")}
              onClick={cancel}
            >
              Avbryt
            </button>
            {send}
          </div>
        </>
      )}
    </form>
  );
}

export default function ProjectPost({
  project,
  initialUpdateId,
  initialCommentId,
  initialSection,
  closeOnEscape = false,
  onClose,
  mobile = false,
  feedback,
  saved,
  onSave,
  onNotify,
}: Props) {
  // Loaded as the project opens, unless the page was rendered with them.
  const comments = useComments(projectComments(project.id));
  const contentRef = useRef<HTMLDivElement>(null);
  const tabScroll = useRef<Record<string, number>>({});
  const { user, canModerate, requireLogin } = useAuth();
  const { mutate, suggest } = useCommunity();
  const onUpdate = (next: Project) =>
    mutate({ action: "project", project: next, create: false });
  const [discussionSort, setDiscussionSort] =
    useState<DiscussionSort>("relevant");
  // A project with updates opens on them; a linked comment opens its tab.
  const [tab, setTab] = useState<string>(
    () =>
      initialSection ??
      (initialUpdateId
        ? "updates"
        : !initialCommentId && getProjectUpdates(project).length > 0
          ? "updates"
          : "discussion"),
  );
  // A comment opened while the project is already open shows its tab.
  const [shownCommentId, setShownCommentId] = useState(initialCommentId);
  if (initialCommentId !== shownCommentId) {
    setShownCommentId(initialCommentId);
    if (initialCommentId) setTab("discussion");
  }
  // Updates whose comment section is open; mounted ones stay for the collapse.
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [highlightId, setHighlightId] = useState(initialUpdateId || "");
  const [copied, setCopied] = useState(false);
  // Edit mode works on a draft; only the changed fields are saved.
  const [draft, setDraft] = useState<Project | null>(null);
  const [stage, setStage] = useState<EditStage>("edit");
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Members' edits become a suggestion, with an optional note.
  const [note, setNote] = useState("");
  const [deleting, setDeleting] = useState<"confirm" | "busy" | null>(null);
  const changed = draft ? changedFields(draft, project) : [];
  const dirty = changed.length > 0;
  const edit = draft && {
    draft,
    original: project,
    changed,
    change: (patch: Partial<Project> | ((draft: Project) => Partial<Project>)) =>
      setDraft(
        (current) =>
          current && {
            ...current,
            ...(typeof patch === "function" ? patch(current) : patch),
          },
      ),
    uploading,
    onUploading: setUploading,
    revert: (id: FieldId) => {
      const saved = toDraft(project);
      setDraft(
        (current) =>
          current && {
            ...current,
            ...Object.fromEntries(
              fields[id].keys.map((key) => [key, saved[key]]),
            ),
          },
      );
    },
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function startEditing() {
    if (
      !canModerate &&
      !requireLogin("Du må være logget inn for å foreslå endringer.", {
        type: "edit",
        projectId: project.id,
      })
    )
      return;
    setDraft(toDraft(project));
    setUploading(false);
    setNote("");
    setStage("edit");
    contentRef.current?.scrollTo({ top: 0 });
  }
  function stopEditing() {
    setDraft(null);
    setUploading(false);
    setStage("edit");
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          // The edit button, or the menu it has moved into.
          '[data-project-actions] [aria-label="Rediger prosjekt"], [data-project-actions] [aria-label="Foreslå endring"], [data-project-actions] [data-overflow-menu]',
        )
        ?.focus({ preventScroll: true }),
    );
  }
  /** Closing (✕, Esc) steps out of a review, then out of edit mode, first. */
  function close() {
    if (!draft) return onClose();
    if (stage !== "edit") return setStage("edit");
    if (dirty) setStage("discard");
    else stopEditing();
  }
  // Back from logging in to suggest a change: edit mode again.
  const member = Boolean(user?.username);
  const resumeEdit = useEffectEvent(() => startEditing());
  useEffect(() => {
    // Not cancelled: the intent is already taken.
    if (member && takeLoginIntent("edit", project.id))
      requestAnimationFrame(resumeEdit);
  }, [member, project.id]);
  async function saveEdits() {
    if (!draft || !dirty || savingEdit || uploading) return;
    setSavingEdit(true);
    try {
      const changes = changesToSave(draft, changed);
      if (canModerate) {
        await onUpdate(applyChanges(project, changes));
        stopEditing();
        onNotify(
          changed.length === 1
            ? "Endringen er lagret"
            : `${changed.length} endringer er lagret`,
        );
      } else {
        await suggest({
          kind: "correction",
          projectId: project.id,
          // A removed link travels as an empty one.
          // A removed link travels as an empty one, and no further photos
          // as an empty list.
          changes: {
            ...changes,
            ...("website" in changes && { website: changes.website ?? "" }),
            ...("images" in changes && { images: changes.images ?? [] }),
            // Phases all back on the timeline travel as an empty list.
            ...("skippedPhases" in changes &&
              project.skippedPhases && {
                skippedPhases: changes.skippedPhases ?? [],
              }),
            // As do milestones all taken off.
            ...("milestones" in changes &&
              project.milestones && {
                milestones: changes.milestones ?? [],
              }),
          },
          note,
        });
        stopEditing();
        onNotify("Forslaget er sendt");
      }
    } catch (error) {
      onNotify(
        errorMessage(
          error,
          canModerate
            ? "Kunne ikke lagre endringene."
            : "Kunne ikke sende forslaget.",
        ),
      );
    } finally {
      setSavingEdit(false);
    }
  }
  const updates = getProjectUpdates(project);
  const referenceCounts = new Map<string, number>();
  for (const comment of comments ?? [])
    if (comment.updateId)
      referenceCounts.set(
        comment.updateId,
        (referenceCounts.get(comment.updateId) ?? 0) + 1,
      );
  // Updates are the project's own record; the discussion follows them.
  const tabs = [
    {
      id: "updates",
      label: "Oppdateringer",
      icon: Megaphone,
    },
    {
      id: "discussion",
      label: "Kommentarer",
      icon: MessageCircle,
    },
  ];
  useEffect(() => {
    // In the frame it first draws in, so the style it asks for is the
    // frame's own rather than one more on the way.
    const frame = requestAnimationFrame(() =>
      document
        .getElementById("project-card-title")
        ?.focus({ preventScroll: true }),
    );
    if (initialUpdateId)
      requestAnimationFrame(() =>
        document
          .getElementById(`update-${initialUpdateId}`)
          ?.scrollIntoView({ block: "start" }),
      );
    else if (initialSection)
      requestAnimationFrame(() =>
        document
          .getElementById("project-sections")
          ?.scrollIntoView({ block: "start" }),
      );
    return () => cancelAnimationFrame(frame);
  }, [project.id, initialUpdateId, initialSection]);
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      document.querySelector("dialog[open]")
    )
      return;
    event.preventDefault();
    close();
  });
  useEffect(() => {
    if (!closeOnEscape) return;
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [closeOnEscape]);
  /**
   * Tabs share everything above them, so switching keeps the scroll position.
   * Once scrolled past the tab bar, each tab returns to where it was left.
   */
  function selectTab(next: string) {
    const root = contentRef.current;
    const tabs = document.getElementById("project-sections");
    if (!root || !tabs || next === tab) return setTab(next);
    const pinAt =
      tabs.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop;
    const pinned = root.scrollTop >= pinAt - 1;
    tabScroll.current[tab] = root.scrollTop;
    flushSync(() => setTab(next));
    if (pinned)
      root.scrollTop = Math.max(pinAt, tabScroll.current[next] ?? pinAt);
  }
  function readUpdate(id: string) {
    setTab("updates");
    setHighlightId(id);
    requestAnimationFrame(() =>
      document
        .getElementById(`update-${id}`)
        ?.scrollIntoView({ block: "start" }),
    );
  }
  function toggleComments(id: string) {
    setOpenComments((open) => ({ ...open, [id]: !open[id] }));
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${projectHref(project.id)}`,
      );
      setCopied(true);
      onNotify("Lenke kopiert");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onNotify("Kopier prosjektets lenke fra adressefeltet i nettleseren.");
    }
  }
  async function deleteProject() {
    setDeleting("busy");
    try {
      await mutate({ action: "delete-project", projectId: project.id });
      setDeleting(null);
      onClose();
      onNotify("Prosjektet er slettet");
    } catch (error) {
      setDeleting("confirm");
      onNotify(errorMessage(error, "Kunne ikke slette prosjektet."));
    }
  }
  const actions = {
    onEdit: startEditing,
    onDelete: canModerate ? () => setDeleting("confirm") : undefined,
    suggest: !canModerate,
    copied,
    saved,
    onSave,
    onShare: share,
    guest: !user,
  };
  const content = (
    <ProjectEditContext value={edit}>
      <article
        className="relative flex h-full min-h-0 flex-col bg-surface"
        data-project-post=""
      >
        <ProjectPostHeader
          project={project}
          scrollRootRef={contentRef}
          onClose={close}
          mobile={mobile}
          actions={actions}
        />
        <div
          ref={contentRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(24px+var(--drawer-keyboard-inset,0px))] scrollbar-thin"
          data-project-scroll=""
          data-drawer-scroll
        >
          <div>
            <section
              className="px-4.5 pt-0.5 pb-2 md:px-gutter-scroll"
              aria-label="Om prosjektet"
            >
              {draft ? (
                // Fields follow the description, where the map has room.
                <div className="pb-6" data-project-header-hero="">
                  <EditDescription />
                  <EditImages />
                  <EditFacts />
                </div>
              ) : (
                <>
                  <ProjectMeta project={project} />
                  <ProjectIntro project={project} />
                  {/* Members correct the page from here; moderators edit
                      from the menu. */}
                  {!canModerate && (
                    <SuggestChangeHint
                      projectId={project.id}
                      onSuggest={startEditing}
                    />
                  )}
                </>
              )}
            </section>
            <nav
              className="mx-4.5 border-b border-border md:mx-gutter-scroll"
              hidden={Boolean(draft)}
              id="project-sections"
              aria-label="Prosjektinnhold"
            >
              <div className="flex items-center gap-6">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    className={cn(
                      "-mb-px flex min-h-11 items-center justify-center gap-1.75 border-b-2 border-transparent",
                      "text-sm leading-normal font-medium whitespace-nowrap text-muted",
                      "hover:text-ink",
                      "aria-pressed:border-ink aria-pressed:text-ink max-xs:[&>svg]:hidden",
                    )}
                    aria-pressed={tab === id}
                    aria-controls={`project-panel-${id}`}
                    data-press=""
                    onClick={() => selectTab(id)}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
                {/* The comments' order, on their tab's own line. */}
                {tab === "discussion" &&
                  (comments?.filter((comment) => !comment.deleted).length ??
                    0) > 1 && (
                    // Narrow, its icon alone; the menu names the order.
                    <div className="ml-auto max-sm:[&_[data-slot=choice-trigger]>span]:sr-only">
                      <DiscussionSortSelect
                        value={discussionSort}
                        onChange={setDiscussionSort}
                      />
                    </div>
                  )}
              </div>
            </nav>
            <div
              className="px-4.5 pt-4.5 pb-8 md:px-gutter-scroll md:pt-5"
            >
              <BelowTabs
                className="min-w-0"
                hidden={Boolean(draft)}
                now={Boolean(
                  initialUpdateId || initialCommentId || initialSection,
                )}
              >
                <div
                  id="project-panel-discussion"
                  hidden={tab !== "discussion"}
                >
                  {comments ? (
                    <ProjectDiscussion
                      projectId={project.id}
                      comments={comments}
                      updates={updates}
                      initialCommentId={initialCommentId}
                      sort={discussionSort}
                      onSortChange={setDiscussionSort}
                      onReadUpdate={readUpdate}
                      onNotify={onNotify}
                    />
                  ) : (
                    <CommentsLoading />
                  )}
                </div>
                <section
                  id="project-panel-updates"
                  hidden={tab !== "updates"}
                  aria-label="Prosjektoppdateringer"
                >
                  <UpdateComposer
                    key={canModerate ? "update" : "tip"}
                    project={project}
                    onUpdate={onUpdate}
                    onTip={
                      canModerate
                        ? undefined
                        : (tip) =>
                            suggest({
                              kind: "update",
                              projectId: project.id,
                              ...tip,
                            })
                    }
                    onNotify={onNotify}
                    onPublished={readUpdate}
                    empty={!updates.length}
                  />
                  {updates.length > 0 && (
                    <div className={styles.timeline}>
                      {updates.map((update) => (
                        <article
                          id={`update-${update.id}`}
                          key={update.id}
                          className={styles.entry}
                          data-highlighted={highlightId === update.id}
                        >
                          <p className="text-xs leading-normal text-muted">
                            <RelativeTime
                              date={update.date}
                              mode="suffix"
                              withYear
                            />
                            {update.via && (
                              <>
                                {" · via "}
                                <Credit username={update.via} />
                              </>
                            )}
                          </p>
                          <h3 className="mt-1 mb-2.5 text-heading max-sm:mt-0.5 max-sm:mb-2 max-sm:text-item">
                            {update.title}
                          </h3>
                          {update.body.split("\n\n").map((paragraph, index) => (
                            <p
                              key={index}
                              className="mb-4 text-body leading-[1.65] whitespace-pre-wrap wrap-anywhere text-ink-soft max-sm:mb-3"
                            >
                              {paragraph}
                            </p>
                          ))}
                          {!!update.images?.length && (
                            <div className="mt-3.5 mb-0.5">
                              <ImageGallery
                                images={update.images}
                                label={`Bilder til ${update.title}`}
                                sizes="(max-width: 640px) 100vw, 720px"
                                className="aspect-2/1 max-sm:aspect-3/2"
                              />
                            </div>
                          )}
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-5">
                            <button
                              type="button"
                              className={updateAction}
                              data-comments-toggle=""
                              aria-expanded={!!openComments[update.id]}
                              aria-controls={`update-comments-${update.id}`}
                              onClick={() => toggleComments(update.id)}
                            >
                              <MessagesSquare size={16} aria-hidden="true" />
                              <span>
                                {openComments[update.id]
                                  ? "Skjul kommentarer"
                                  : "Se kommentarer"}
                              </span>
                              {!openComments[update.id] && (
                                <small className="text-ui font-medium text-muted tabular-nums">
                                  {referenceCounts.get(update.id) ?? 0}
                                </small>
                              )}
                            </button>
                            {update.sourceUrl && (
                              <a
                                className={updateAction}
                                href={update.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span>Les kilden</span>
                                <ArrowUpRight size={14} aria-hidden="true" />
                              </a>
                            )}
                          </div>
                          {/* An update's own comment section, unfolding below its actions. */}
                          <div
                            id={`update-comments-${update.id}`}
                            className={cn(
                              "grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-280 ease-out-soft motion-reduce:transition-none",
                              "data-[open=true]:grid-rows-[1fr] data-[open=true]:opacity-100",
                            )}
                            data-update-comments=""
                            data-open={!!openComments[update.id]}
                            inert={!openComments[update.id]}
                          >
                            {/* Clip, not hidden: the mobile dock inside must stay sticky.
                                The margin leaves room for focus outlines. */}
                            <div className="-mx-1.5 min-h-0 overflow-clip px-1.5">
                              {update.id in openComments &&
                                (comments ? (
                                  <ProjectDiscussion
                                    projectId={project.id}
                                    comments={comments}
                                    updates={updates}
                                    updateId={update.id}
                                    onReadUpdate={readUpdate}
                                    onNotify={onNotify}
                                  />
                                ) : (
                                  <CommentsLoading />
                                ))}
                              {update.id in openComments && (
                                <CommentsDock
                                  id={update.id}
                                  open={!!openComments[update.id]}
                                  onClose={() => toggleComments(update.id)}
                                />
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </BelowTabs>
            </div>
          </div>
          {draft && (
            <EditBar
              stage={stage}
              saving={savingEdit}
              onStage={setStage}
              onConfirm={() => void saveEdits()}
              onDiscard={stopEditing}
              suggestion={
                canModerate ? undefined : { note, onNote: setNote }
              }
            />
          )}
        </div>
      </article>
      {feedback}
      {/* Phones: the sheet slides away as the deletion starts. */}
      {deleting === "confirm" && mobile && (
        <ActionSheet
          label="Slette prosjektet?"
          title="Slette prosjektet?"
          actions={[
            {
              id: "delete-project",
              label: "Slett prosjekt",
              detail: `«${project.title}» forsvinner for alle. Dette kan ikke angres.`,
              icon: <Trash2 size={20} />,
              danger: true,
              onSelect: () => void deleteProject(),
            },
          ]}
          onClose={() => setDeleting(null)}
        />
      )}
      {deleting && !mobile && (
        <Dialog
          title="Slette prosjektet?"
          closeButton={false}
          className="w-[400px]"
          initialFocusSelector="[data-delete-cancel]"
          onClose={() => deleting !== "busy" && setDeleting(null)}
        >
          <div className="p-5">
            <h2 className="text-title">Slette prosjektet?</h2>
            <p className="mt-1.5 text-ui text-muted">
              «{project.title}» forsvinner for alle, med oppdateringer,
              kommentarer og forslag. Dette kan ikke angres.
            </p>
            <div className="mt-5 flex justify-end gap-2 max-sm:flex-col-reverse">
              <button
                type="button"
                className={secondaryButton}
                disabled={deleting === "busy"}
                data-delete-cancel=""
                onClick={() => setDeleting(null)}
              >
                Avbryt
              </button>
              <button
                type="button"
                className={dangerButton}
                disabled={deleting === "busy"}
                onClick={() => void deleteProject()}
              >
                {deleting === "busy" ? "Sletter …" : "Slett prosjekt"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </ProjectEditContext>
  );
  return content;
}
