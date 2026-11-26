import "server-only";
import { databaseConfig } from "../db/config";

/**
 * Development only: `next dev` against a local SQLite file. Next inlines
 * NODE_ENV into production builds, so there this is constant false and the
 * dev sign-in can't be reached, whatever the environment variables say.
 */
export function devLoginEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    databaseConfig().url.startsWith("file:")
  );
}
export const devAccounts = {
  moderator: {
    id: "dev-moderator",
    email: "moderator@dev.planfri.invalid",
    username: "dev_moderator",
    name: "Dev Moderator",
  },
  member: {
    id: "dev-member",
    email: "medlem@dev.planfri.invalid",
    username: "dev_medlem",
    name: "Dev Medlem",
  },
} as const;
export type DevRole = keyof typeof devAccounts;
/** The dev moderator moderates without being listed in MODERATOR_EMAILS. */
export function isDevModerator(email: string) {
  return devLoginEnabled() && email === devAccounts.moderator.email;
}
