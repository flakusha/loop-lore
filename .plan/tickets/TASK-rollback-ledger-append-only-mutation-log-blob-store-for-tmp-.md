<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: rollback ledger: append-only mutation log + blob store for .tmp scratch

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Every `.tmp` scratch mutation (PROGRESS.md, LANE/FIXED files) records its before-image BEFORE applying, into an append-only `ledger.jsonl` plus a content-addressed blob store under `.tmp/intercom/rollback/`. Rollback = inverse replay on the linear log. Concurrency via `O_APPEND` atomic lines (no locking); seqs assigned at read time. One wrapper script `scripts/safe-mutate.ts` with subcommands write/append/delete/log/restore/snapshot/record/fsck/gc. Pijul was evaluated as the backing layer and declined (rationale + flip thresholds in the design doc).

**Context:**

- Location: `.tmp/intercom/rollback/` (via the intercom symlink — shared across worktrees, machine-local, gitignored, git-op-proof).
- Why: `.tmp/` scratch was destroyed twice by write-tool overwrites (2026-11-11: 638 -> 5 lines, `.tmp/intercom-legacy/PROGRESS-loss-note.md:3-6`; 2026-11-17: ~1108 lines), both unrecoverable because `.tmp` is gitignored (`.gitignore:73`).
- Scope: stdlib only, single bun script, no deps, no migration — history starts empty; surviving LANE/FIXED files are the archive.
- Order: build FIRST — the child claim-manifest ticket wires its check into safe-mutate.
- Epic: none (process tooling). Suggested link only: `epic-remote-harness-federation.md` (Status Not Started) — not bound.

**Related:**

- `.tmp/research/rollback-ledger-design.md` (design)
- child ticket (claim manifest) — filed next, depends on this one
- `.tmp/intercom-legacy/PROGRESS-loss-note.md:3-6` (precedent losses)
- `honkbox/.plan/tickets/TASK-resource-ledger-bounded-queue.md` (Status: proposed) — honkbox ledger analogue (VRAM/resource ledger, not a mutation ledger)

**Acceptance Criteria:**

- [ ] Kill test: clobber PROGRESS.md, one-command `restore` returns byte-exact content (sha256 match).
- [ ] 2x100 concurrent appended entries -> 200 intact parseable lines, all blobs resolve.
- [ ] `log --path` shows independent generations, each restorable.
- [ ] `gc` reclaims bytes; all surviving entries' blobs resolve.
- [ ] PROGRESS.md appends go through `safe-mutate.ts append`; the standing heredoc-only rule is retired (same syscall + ledger entry).
- [ ] Tests passing, docs updated.
