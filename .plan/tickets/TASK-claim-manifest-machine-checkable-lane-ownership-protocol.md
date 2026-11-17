<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: claim manifest: machine-checkable lane ownership protocol

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Lane ownership today is prose (`Owned files` / `Forbidden` in LANE files) plus `claim`/`done` events in `.tmp/intercom/events.jsonl` — nothing mechanical answers "may I touch path X". Source of truth becomes `.tmp/intercom/claims.jsonl` (append-only claim/release events, glob sets, 24h expiry as the deadlock valve) plus a regenerated human view `CLAIMS.md` (the jsonl always wins). Lifecycle commands live in `scripts/claims.ts` (claim/may/release/list/render/audit); the one-command check is `claims.ts may <path> --lane <me>` (exit 0/1). `safe-mutate.ts` refuses DENY writes (`--force` override is logged). Post-hoc `claims-audit` folds both logs to catch writes made by uninterceptable tools (ctx_patch, editors).

**Context:**

- Design: `.tmp/research/claim-manifest-design.md`. Pijul was evaluated as the backing layer and declined more strongly than for the ledger — a claim conflict is a business rule (first-active-claim-wins), not a merge problem.
- Depends on the rollback-ledger ticket (wires into safe-mutate, shares the append/atomicity reasoning).
- Effort: S (~150 lines in `scripts/claims.ts` + safe-mutate hook). No daemon, no hooks, no new deps.
- Epic: none (process tooling) — same as the rollback-ledger ticket.

**Related:**

- `.tmp/research/claim-manifest-design.md` (design)
- rollback-ledger ticket (parent; must land first)
- `.tmp/intercom/LANE-instance-path-hygiene.md:15-35` (current prose ownership)
- `.tmp/intercom/events.jsonl:1-10` (current claim/done events)
- honkbox: no analogue ticket (lane-claim protocol is loop-lore-only)

**Acceptance Criteria:**

- [ ] `may <path>` answers in < 1s: OK / DENY+holder / STALE.
- [ ] Overlapping claim exits 1 naming the holder; the fold shows the first claimer.
- [ ] The wrapper refuses DENY writes; `--force` writes with a ledger trail.
- [ ] `claims-audit` catches a seeded unlogged cross-lane edit.
- [ ] A 25h-old unrenewed claim no longer blocks (expiry valve).
- [ ] Active LANE files are seeded as initial claims (one-time prose -> glob transcription); LANE/FIXED templates updated.
- [ ] Tests passing, docs updated.
