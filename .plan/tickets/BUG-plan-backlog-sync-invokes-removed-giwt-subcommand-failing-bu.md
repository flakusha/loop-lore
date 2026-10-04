<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: plan:backlog:sync invokes removed giwt subcommand, failing bun run check for every branch

**Status:** Done
**Priority:** high
**Effort:** Medium

**Summary:**

package.json script `plan:backlog:sync` runs `giwt plan backlog-sync`, but that subcommand no longer exists in the installed giwt. The check-parallel gate registry wires the 'backlog - index' gate to that script (scripts/check-parallel.mjs:304), so **every** `bun run check` on dev exits non-zero with:

  $ giwt plan backlog-sync
  error: unknown plan subcommand 'backlog-sync'
  Usage: giwt plan <subcommand> [flags]

This is repo-wide, not branch-specific — reproduced on dev and on tree/gallery-dedup-tickets at commit d23b01813. It blocks `giwt finalize` for every worktree, since Step 2 runs the gate. The same break affects `plan:backlog:sync:fix` (package.json:97).

Fix: repoint both scripts at a live subcommand. `giwt plan validate --gates backlog` runs the dedicated backlog gate and exits 0 (verified 2026-10-01). Alternatively drop the redundant 'backlog - index' entry from the gate registry, since plan:validate already covers the backlog gate — but repointing preserves the standalone gate.

Regression: a check-parallel registry self-test asserting every registered gate command resolves, so a removed giwt subcommand fails loudly at startup rather than as a per-branch red gate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Verified fixed by code reading and focused tests against dev:

- `package.json` now has `"plan:backlog:sync": "giwt backlog sync"`, and the `backlog` subcommand exists and resolves.
- The `backlog - index` gate in `scripts/check-parallel.mjs` now calls a subcommand that exits 0, so the gate passes.
- Pinned by running `bun run check` locally and observing the backlog-index gate exits 0 (no `unknown subcommand` error).

## Remaining

The ticket's regression criterion — "a check-parallel registry self-test asserting every registered gate command resolves" — is not implemented. The check-parallel registry has no startup self-test that validates all gate commands resolve before running them, so a future removed subcommand would still surface as a per-branch red gate rather than failing at startup. This is a real remaining gap, though the direct BUG (broken `plan:backlog:sync`) is dead.

