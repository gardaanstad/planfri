"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  Bookmark,
  Check,
  Ellipsis,
  Pencil,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import type { Project } from "../lib/data";
import { cn } from "../lib/cn";
import {
  fieldControl,
  iconButton,
  panelTitle,
  panelTitleBottom,
  panelTitleTop,
  wrapTitle,
} from "../lib/ui";
import ActionSheet, { type SheetAction } from "./action-sheet";
import { OverflowMenu, type OverflowAction } from "./header-overflow";
import { EditField, editState, useProjectEdit } from "./project-edit";

const headerIconButton = cn(
  iconButton,
  "rounded-lg max-md:size-10 active:scale-100 pointer-fine:active:scale-[0.97]",
);

const titleType = panelTitle;

export type ProjectActionsProps = {
  /** Enters edit mode; members suggest their changes. */
  onEdit?: () => void;
  suggest?: boolean;
  copied: boolean;
  saved: boolean;
  onSave: () => void;
  onShare: () => void;
  /** Signed out: saving and suggesting ask to log in first. */
  guest?: boolean;
  /** Moderators: deletes the project, after asking. Always in the menu. */
  onDelete?: () => void;
};

type HeaderProps = {
  project: Project;
  actions: ProjectActionsProps;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  /** Phones: the actions gather in a sheet behind one button. */
  mobile?: boolean;
};

/**
 * Desktop: save, suggest a change, share and, for moderators, delete, in a
 * menu beside the close button, so the title has the bar to itself.
 */
function DesktopActions({
  onEdit,
  suggest = false,
  copied,
  saved,
  onSave,
  onShare,
  onDelete,
}: ProjectActionsProps) {
  const menu: OverflowAction[] = [
    {
      id: "save",
      label: saved ? "Fjern fra lagrede" : "Lagre",
      icon: <Bookmark size={16} fill={saved ? "currentColor" : "none"} />,
      pressed: saved,
      onSelect: onSave,
    },
    ...(onEdit
      ? [
          {
            id: "edit",
            label: suggest ? "Foreslå endring" : "Rediger prosjekt",
            icon: <Pencil size={16} />,
            onSelect: onEdit,
          },
        ]
      : []),
    {
      id: "share",
      label: copied ? "Lenke kopiert" : "Kopier lenke",
      icon: copied ? <Check size={16} /> : <Share2 size={16} />,
      onSelect: onShare,
    },
    ...(onDelete
      ? [
          {
            id: "delete",
            label: "Slett prosjekt",
            icon: <Trash2 size={16} />,
            danger: true,
            onSelect: onDelete,
          },
        ]
      : []),
  ];
  return <OverflowMenu actions={menu} />;
}

/** Phones: one button opening a sheet with every action. */
function MobileActions({
  onEdit,
  suggest = false,
  copied,
  saved,
  onSave,
  onShare,
  guest = false,
  onDelete,
}: ProjectActionsProps) {
  const [open, setOpen] = useState(false);
  const actions: SheetAction[] = [
    {
      id: "save",
      label: saved ? "Fjern fra lagrede" : "Lagre",
      icon: <Bookmark size={20} fill={saved ? "currentColor" : "none"} />,
      onSelect: onSave,
      locked: guest,
      pressed: saved,
    },
    ...(onEdit
      ? [
          {
            id: "edit",
            label: suggest ? "Foreslå endring" : "Rediger prosjekt",
            icon: <Pencil size={20} />,
            onSelect: onEdit,
            locked: guest && suggest,
          },
        ]
      : []),
    {
      id: "share",
      label: copied ? "Lenke kopiert" : "Kopier lenke",
      icon: copied ? <Check size={20} /> : <Share2 size={20} />,
      onSelect: onShare,
    },
    ...(onDelete
      ? [
          {
            id: "delete",
            label: "Slett prosjekt",
            icon: <Trash2 size={20} />,
            danger: true,
            onSelect: onDelete,
          },
        ]
      : []),
  ];
  return (
    <>
      <button
        type="button"
        className={cn(headerIconButton, "text-muted")}
        aria-label="Handlinger"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-project-menu=""
        onClick={() => setOpen(true)}
      >
        <Ellipsis size={20} />
      </button>
      {open && (
        <ActionSheet
          label="Handlinger"
          actions={actions}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default function ProjectPostHeader({
  project,
  actions,
  scrollRootRef,
  onClose,
  mobile = false,
}: HeaderProps) {
  const [compact, setCompact] = useState(false);
  const edit = useProjectEdit();
  const editing = Boolean(edit);

  useEffect(() => {
    const root = scrollRootRef.current;
    const details = root?.querySelector("[data-project-header-hero]");
    if (!root || !details) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const rootTop =
          entry.rootBounds?.top ?? root.getBoundingClientRect().top;
        setCompact(
          !entry.isIntersecting && entry.boundingClientRect.bottom <= rootTop,
        );
      },
      { root, threshold: 0 },
    );

    observer.observe(details);
    return () => observer.disconnect();
    // Edit mode swaps the intro, so watch the new one.
  }, [project.id, scrollRootRef, editing]);

  const title = edit ? (
    <EditField
      id="title"
      inline
      className={cn(
        "min-w-0 flex-1 pb-1",
        mobile ? panelTitleTop.mobile : panelTitleTop.desktop,
      )}
    >
      {/* Same type as the heading, with the field's padding outside the text. */}
      <textarea
        className={cn(
          fieldControl,
          editState,
          "-mx-2.5 -my-1.5 field-sizing-content min-h-0 w-[calc(100%+20px)] resize-none rounded-lg px-[9px] py-[5px]",
          titleType,
        )}
        aria-label="Prosjektnavn"
        maxLength={160}
        rows={1}
        value={edit.draft.title}
        onChange={(event) =>
          edit.change({ title: event.target.value.replace(/\n/g, " ") })
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      />
    </EditField>
  ) : (
    <h1
      id="project-card-title"
      tabIndex={-1}
      className={cn(
        "m-0 min-w-0 flex-1 text-balance text-ink outline-none",
        wrapTitle,
        // In full at the top; two lines once scrolled past the intro, so the
        // bar stays small over the text.
        compact && "line-clamp-2",
        // The first line level with the buttons beside it; see panelTitleTop.
        // A margin, not padding, so a clamped third line stays hidden.
        mobile
          ? [panelTitleTop.mobile, panelTitleBottom.mobile]
          : [panelTitleTop.desktop, panelTitleBottom.desktop],
        titleType,
      )}
    >
      {project.title}
    </h1>
  );
  const close = (
    <button
      type="button"
      data-project-close=""
      className={headerIconButton}
      onClick={onClose}
      aria-label="Lukk prosjekt"
    >
      <X size={20} />
    </button>
  );
  const border = cn(
    "transition-[border-color] duration-200 motion-reduce:transition-none",
    compact ? "border-border" : "border-transparent",
  );

  if (mobile)
    return (
      <header
        className={cn(
          // No surface of its own: it rises into the sheet's rounded corners.
          "z-20 flex shrink-0 items-start gap-2 border-b px-4.5 pt-0 pb-1",
          border,
        )}
        data-compact={compact}
      >
        {title}
        {/* The close glyph stands as far in from the side as it is below the top. */}
        <div className="-mr-2.25 flex shrink-0 items-center">
          {!edit && <MobileActions {...actions} />}
          {close}
        </div>
      </header>
    );

  // Desktop: a bar like every sidebar panel's, the close control where the
  // others have it, level with the title's first line, and the project's
  // menu before it.
  return (
    <header
      className={cn("z-20 shrink-0 border-b bg-surface", border)}
      data-compact={compact}
    >
      <div
        // Controls centred 32px down, as on the list's header and every panel's.
        className="flex items-start gap-2 pt-2.5 pr-3 pb-1 pl-6"
      >
        {title}
        <div
          className="flex shrink-0 items-center gap-0.5"
          data-project-actions=""
        >
          {!edit && <DesktopActions {...actions} />}
          {close}
        </div>
      </div>
    </header>
  );
}
