#!/usr/bin/env bash
# Lands the current branch on origin/main: rebase, then push under a lock
# shared by every worktree. See "Landing" in AGENTS.md.
#
# Exit 0: landed (or nothing to land). Exit 1: read the "land:" lines on
# stderr; each failure says what to do next.
set -euo pipefail

say() { printf 'land: %s\n' "$*"; }
fail() { printf 'land: %s\n' "$*" >&2; exit 1; }

rebasing() {
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]
}

# Rebases onto origin/main. Conflicts that rerere already knows are resolved
# and continued automatically; new ones stop the script with the file list.
rebase_on_main() {
  git rebase --quiet origin/main >/dev/null 2>&1 && return 0
  while rebasing; do
    conflicts=$(git diff --name-only --diff-filter=U)
    if [ -n "$conflicts" ]; then
      fail "CONFLICT with origin/main in:
$(printf '%s\n' "$conflicts" | sed 's/^/  /')
Resolve them, git add them, run: GIT_EDITOR=true git rebase --continue
Then rerun scripts/land.sh."
    fi
    if ! GIT_EDITOR=true git rebase --continue >/dev/null 2>&1; then
      if rebasing && [ -z "$(git diff --name-only --diff-filter=U)" ]; then
        fail "rebase stopped without conflicts; run git status, fix, then rerun scripts/land.sh"
      fi
    fi
  done
  git merge-base --is-ancestor origin/main HEAD ||
    fail "could not rebase on origin/main; run git rebase origin/main to see why"
}

# Runs one check silently; on failure prints its output and stops.
check() {
  local out
  out=$("$@" 2>&1) || fail "'$*' failed after rebasing on new commits from main:
$out
Fix it, commit, then rerun scripts/land.sh."
}

branch=$(git symbolic-ref --short -q HEAD) || fail "detached HEAD; check out your branch first"
! rebasing || fail "a rebase is in progress; finish it (GIT_EDITOR=true git rebase --continue) then rerun"
git diff --quiet && git diff --cached --quiet || fail "uncommitted changes; commit them first"

# Remember conflict resolutions so a retry replays them. Shared by all
# worktrees; written once, and a race with another worktree is harmless.
for key in rerere.enabled rerere.autoupdate; do
  [ "$(git config --get "$key")" = true ] || git config "$key" true 2>/dev/null || true
done

git fetch --quiet origin main
tested_base=$(git merge-base HEAD origin/main)

# Phase 1, no lock: catch up with main, so conflicts get resolved without
# making other agents wait.
rebase_on_main
[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] || { say "nothing to land; $branch is already in main"; exit 0; }

# Phase 2, locked: only one worktree at a time gets from here to the push.
exec 9>"$(git rev-parse --git-common-dir)/land.lock"
if ! flock -n 9; then
  say "another agent is landing; waiting for the lock"
  flock -w 1800 9 || fail "waited 30 min for the lock; rerun scripts/land.sh"
fi

for attempt in 1 2 3; do
  git fetch --quiet origin main
  rebase_on_main
  # Main moved past what this branch was tested on: rerun the fast checks.
  # Specs aren't rerun here; they ran on the branch before landing.
  if [ "$(git rev-parse origin/main)" != "$tested_base" ]; then
    say "main has new commits; running lint and typecheck"
    check bun run lint
    check bun run typecheck
    tested_base=$(git rev-parse origin/main)
  fi
  if git push --quiet origin HEAD:main 2>/dev/null; then
    say "landed $branch on main at $(git rev-parse --short HEAD)"
    exit 0
  fi
  say "push rejected (main moved outside land.sh); retrying"
done
fail "push rejected 3 times; run git fetch and git status, then rerun scripts/land.sh"
