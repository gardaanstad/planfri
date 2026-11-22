---
name: push
description: Commit this worktree's changes and land the branch on main with scripts/land.sh.
disable-model-invocation: true
---

The user asked you to commit and push. Don't ask for confirmation.

1. If `git status --short` shows changes: run lint, typecheck and the specs that cover them (see "Testing" in AGENTS.md), fix any failures, then commit everything with a message describing the change. Nothing to commit and nothing ahead of `origin/main`: say so and stop.
2. Run `scripts/land.sh`. On exit 1, do what its last lines say, then run it again. Repeat until it exits 0.
3. Clean up as "Landing" in AGENTS.md says: settle your T3 thread, then remove your worktree and branch.
4. Reply with one line: the commit SHA it landed at, plus any spec that failed and passed on a rerun (flaky). Nothing else.
