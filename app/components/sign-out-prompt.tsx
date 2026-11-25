"use client";
import { useId, useState } from "react";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { primaryButton, secondaryButton } from "../lib/ui";
import ActionSheet from "./action-sheet";
import Dialog from "./dialog";
import { notify } from "./toast";

/** Logs out here, or, first, on every other device too. */
async function signOut(everywhere: boolean) {
  if (everywhere) {
    const revoked = await authClient.revokeOtherSessions().catch(() => null);
    if (!revoked || revoked.error)
      throw new Error("Kunne ikke logge ut andre enheter. Prøv igjen.");
  }
  const result = await authClient.signOut().catch(() => null);
  if (!result || result.error)
    throw new Error("Kunne ikke logge ut. Prøv igjen.");
}

/**
 * Asks before logging out, with the choice of logging out on every device:
 * a sheet on phones, a dialog on desktop.
 */
export default function SignOutPrompt({
  mobile,
  onClose,
  onSignedOut,
}: {
  mobile: boolean;
  onClose: () => void;
  /** Logged out; the parent closes the prompt (a sheet has already gone). */
  onSignedOut: (everywhere: boolean) => void;
}) {
  const id = useId();
  const [everywhere, setEverywhere] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(all: boolean) {
    setBusy(true);
    try {
      await signOut(all);
      onSignedOut(all);
    } catch (error) {
      notify((error as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  if (mobile)
    return (
      <ActionSheet
        label="Logg ut"
        title="Logg ut?"
        actions={[
          {
            id: "sign-out",
            label: "Logg ut",
            icon: <LogOut size={20} />,
            onSelect: () => void run(false),
          },
          {
            id: "sign-out-everywhere",
            label: "Logg ut på alle enheter",
            detail: "Også i andre nettlesere og på andre enheter",
            icon: <MonitorSmartphone size={20} />,
            onSelect: () => void run(true),
          },
        ]}
        onClose={onClose}
      />
    );

  return (
    <Dialog
      title="Logg ut?"
      closeButton={false}
      className="w-[380px]"
      initialFocusSelector="[data-sign-out-confirm]"
      onClose={() => !busy && onClose()}
    >
      <form
        className="p-5"
        data-sign-out-prompt=""
        onSubmit={async (event) => {
          event.preventDefault();
          await run(everywhere);
        }}
      >
        <h2 className="text-title">Logg ut?</h2>
        <p className="mt-1.5 text-ui text-muted">
          Du kan logge inn igjen med Google når som helst.
        </p>
        <label
          htmlFor={`${id}-everywhere`}
          className="mt-4 flex cursor-pointer items-start gap-3 text-ui"
        >
          <input
            id={`${id}-everywhere`}
            type="checkbox"
            checked={everywhere}
            disabled={busy}
            onChange={(event) => setEverywhere(event.target.checked)}
            className="mt-0.5 size-4.5 shrink-0 cursor-pointer accent-accent"
          />
          <span>
            Logg ut på alle enheter
            <span className="block text-xs text-muted">
              Også i andre nettlesere og på andre enheter
            </span>
          </span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={onClose}
          >
            Avbryt
          </button>
          <button
            type="submit"
            className={primaryButton}
            disabled={busy}
            data-sign-out-confirm=""
          >
            {busy ? "Logger ut …" : "Logg ut"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
