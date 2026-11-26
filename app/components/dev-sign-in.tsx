"use client";
import { useState } from "react";
import { secondaryButton } from "../lib/ui";
import { cn } from "../lib/cn";

const roles = [
  { role: "moderator", label: "Moderator" },
  { role: "member", label: "Medlem" },
] as const;

/** Development only: sign in as a fixed moderator or member, without Google. */
export default function DevSignIn({ next }: { next: string }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function signIn(role: string) {
    setPending(role);
    setError("");
    try {
      const response = await fetch("/api/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error();
      // A full load, so the server renders the new session.
      window.location.assign(next);
    } catch {
      setError("Dev-innloggingen feilet.");
      setPending(null);
    }
  }
  return (
    <div className="mt-4" data-dev-login="">
      <p className="mb-2 text-center text-xs text-muted">
        Utvikling: logg inn som
      </p>
      <div className="flex gap-2">
        {roles.map(({ role, label }) => (
          <button
            key={role}
            type="button"
            disabled={!!pending}
            onClick={() => void signIn(role)}
            className={cn(secondaryButton, "flex-1")}
          >
            {pending === role ? "Logger inn …" : label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
