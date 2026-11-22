"use client";
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Ellipsis, Trash2 } from "lucide-react";
import { cn } from "../lib/cn";
import { mobileQuery, useMediaQuery } from "../lib/media";
import { dangerButton, secondaryButton } from "../lib/ui";
import ActionSheet from "./action-sheet";
import Dialog from "./dialog";

const trigger = cn(
  "grid size-8 place-items-center rounded-md p-0 text-muted max-sm:size-9",
  "transition-colors hover:bg-ink/[0.06] hover:text-ink",
  "data-popup-open:bg-ink/[0.06] data-popup-open:text-ink aria-expanded:bg-ink/[0.06] aria-expanded:text-ink",
);
const item = cn(
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 outline-none select-none",
  "pointer-fine:data-highlighted:bg-surface-muted focus-visible:bg-surface-muted pointer-coarse:min-h-11",
  "[&>svg]:shrink-0",
);

/**
 * The actions on a member's own comment: a dropdown on desktop, a sheet on
 * phones. Deleting asks first.
 */
export default function CommentMenu({
  hasReplies,
  onDelete,
}: {
  hasReplies: boolean;
  onDelete: () => Promise<void>;
}) {
  const mobile = useMediaQuery(mobileQuery);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = "Valg for kommentaren";

  return (
    <>
      {mobile ? (
        <button
          type="button"
          className={trigger}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          data-comment-menu=""
          onClick={() => setSheetOpen(true)}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </button>
      ) : (
        <Menu.Root>
          <Menu.Trigger
            className={trigger}
            aria-label={label}
            data-tooltip="Flere valg"
            data-comment-menu=""
          >
            <Ellipsis size={16} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              side="bottom"
              align="end"
              sideOffset={4}
              className="z-[1000]"
            >
              <Menu.Popup
                aria-label={label}
                className="min-w-44 rounded-xl border border-border bg-surface p-1.5 text-ui shadow-popover outline-none motion-safe:animate-menu-enter"
              >
                <Menu.Item
                  className={cn(item, "text-danger")}
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Slett
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
      {sheetOpen && (
        <ActionSheet
          label={label}
          actions={[
            {
              id: "delete",
              label: "Slett",
              icon: <Trash2 size={20} />,
              danger: true,
              onSelect: () => setConfirming(true),
            },
          ]}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {confirming && (
        <Dialog
          title="Slette kommentaren?"
          closeButton={false}
          className="w-[360px]"
          onClose={() => !busy && setConfirming(false)}
        >
          <div className="p-5">
            <h2 className="text-heading">Slette kommentaren?</h2>
            {hasReplies && (
              <p className="mt-1.5 text-ui text-muted">Svarene blir stående.</p>
            )}
            <div className="mt-5 flex justify-end gap-2 max-sm:flex-col-reverse">
              <button
                type="button"
                className={secondaryButton}
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Avbryt
              </button>
              <button
                type="button"
                className={dangerButton}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onDelete();
                  } finally {
                    setBusy(false);
                    setConfirming(false);
                  }
                }}
              >
                {busy ? "Sletter …" : "Slett"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
