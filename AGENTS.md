<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Testing

`bun run test` runs the Playwright specs against a production build. Each worktree has its own port, database and build, so worktrees never block each other.

Before committing, run `bun run lint`, `bun run typecheck`, and the specs for what you changed: `bun run test tests/explorer.spec.ts -g "<test name>"`. Grep `tests/` for the text, roles or `data-*` attributes you touched to find them.

- `explorer.spec.ts`: list, map, filters, search, sort, place, sidebar and mobile drawer
- `panels.spec.ts`: project panels, headers and actions, login prompt, account panel, Forslag
- `accounts.spec.ts`: sign-in, onboarding, usernames, profiles, account settings, authorization
- `discussion.spec.ts`: comments, replies, votes, sorting, project updates
- `saved.spec.ts`: read state, unread marks, saving, Lagret
- `suggestions.spec.ts`: suggestions and moderation
- `uploads.spec.ts`: photo uploads
- `osm-candidates.spec.ts`: OpenStreetMap candidates
- `diff.spec.ts`: suggestion diff (no browser)
- `categories.spec.ts`: the category tree and retired names (no browser)

Run the full suite, in the background, only when asked or when you touch shared ground: `explorer.tsx`, panels and drawers, `app/layout.tsx`, global CSS, auth, the schema or migrations, `scripts/seed-data.ts`, or the test setup (`playwright.config.ts`, `tests/support.ts`, `scripts/test-db.ts`). If an unrelated spec fails, rerun it alone; if it then passes, it's flaky. Mention it, don't fix it here.

Writing specs:

- They run with reduced motion. A spec about motion starts with `await page.emulateMedia({ reducedMotion: "no-preference" })`.
- No traces by default; rerun with `--trace on` to get one. `TEST_SCREENSHOTS=<dir>` saves the screenshots taken with `shot()`.
- Pages are server-rendered, so a click can land before hydration. Never fix that with retries or timeouts: register listeners in a layout effect, or wait for a visible ready sign. Check a flake fix with `--repeat-each 60 --workers 12`.

# Development data

`local.db` holds a copy of production's projects plus fictional updates and comments (`bun run db:sample`, rerun with `--if-stale` and migrations by `bun dev` and Preview). When a change needs projects of a particular kind to try out (a long title, no photo, a line, many updates, a deep thread), write a `local-samples/<name>.ts` in your worktree using `localProject()` from `scripts/local-samples.ts`, with ids starting `local-`, and run `bun run db:sample`. The folder is gitignored and only reaches your worktree's database; delete the file and rerun to remove its rows. Specs use `scripts/seed-data.ts`, not this.

# Landing

Land only when asked. Otherwise stop after the checks and leave the work uncommitted.

To land: commit, then run `scripts/land.sh` from your worktree. It rebases on `origin/main`, queues behind other agents, reruns lint and typecheck if main moved, and pushes. Never push anything yourself, and never merge main into your branch.

On exit 1, follow its last lines and rerun. For conflicts: resolve, `git add`, `GIT_EDITOR=true git rebase --continue`, rerun.

On exit 0:

1. Settle your T3 thread with `t3_thread_organize` (`action: "settle"`), if available.
2. Remove your worktree and branch (last, since it deletes your working directory): `branch=$(git branch --show-current); wt=$(git rev-parse --show-toplevel); main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)"); git -C "$main" worktree remove "$wt" && git -C "$main" branch -D "$branch"`

# Reporting

Report what changed and what you found, not the process. Don't cite or quote these rules to the user. Keep environment, Git, test and landing details to one line at most, e.g. "Lint, typecheck and explorer specs pass." After landing, reply with just the landed SHA and any flaky spec.

# Design

Follow `docs/design.md` for overlays, type, sizing and states; reuse the classes in `app/lib/ui.ts`.
