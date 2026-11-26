"use client";
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Ellipsis, Trash2 } from "lucide-react";
import { cn } from "../lib/cn";
import { DropdownPopup } from "./dropdown";
import { mobileQuery, useMediaQuery } from "../lib/media";
import {
  dangerButton,
  menuItem,
  menuItemDanger,
  secondaryButton,
} from "../lib/ui";
import ActionSheet from "./action-sheet";
import Dialog from "./dialog";

const trigger = cn(
  "grid size-8 place-items-center rounded-md p-0 text-muted max-sm:size-9",
  "transition-colors hover:bg-ink/[0.05] hover:text-ink",
  "data-popup-open:bg-ink/[0.05] data-popup-open:text-ink aria-expanded:bg-ink/[0.05] aria-expanded:text-ink",
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
          <DropdownPopup aria-label={label}>
            <Menu.Item
              className={cn(menuItem, menuItemDanger)}
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={16} aria-hidden="true" />
              Slett
            </Menu.Item>
          </DropdownPopup>
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
      {confirming && mobile && (
        <ActionSheet
          label="Slette kommentaren?"
          title="Slette kommentaren?"
          actions={[
            {
              id: "confirm-delete",
              label: "Slett",
              detail: hasReplies ? "Svarene blir stående." : undefined,
              icon: <Trash2 size={20} />,
              danger: true,
              onSelect: () => void onDelete(),
            },
          ]}
          onClose={() => setConfirming(false)}
        />
      )}
      {confirming && !mobile && (
        <Dialog
          title="Slette kommentaren?"
          closeButton={false}
          className="w-[360px]"
          onClose={() => !busy && setConfirming(false)}
        >
          <div className="p-5">
            <h2 className="text-title">Slette kommentaren?</h2>
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
