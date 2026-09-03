<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# 2026-09-03 Research Evidence Index

This subdirectory captures research artifacts that were originally produced
in `.tmp/` (auto-cleanup zone) and promoted to durable `docs/meta/`
locations. Each file is referenced from one or more TASK / BUG tickets and
provides the evidence trail for those decisions.

## Files

### Code Quality / Dead-Duplicate Triage (knip + jscpd)

- **`knip-jscpd-research-2026-09-03.md`** — knip v6 + jscpd v5 raw output,
  per-dir/per-file clone ranking, noise analysis (locales/CSS/generated
  mass), and the policy decisions reached.
- **`knip-jscpd-confirmation-2026-09-03.md`** — post-fix verification + the
  mapping of decisions to TASK tickets (D1-D7).
- **`analyze-jscpd.cjs`** — re-runnable analysis script. Invoke against a
  fresh `jscpd --reporters json --output . jscpd-report.json` to reproduce
  the per-dir clone ranking.

**Tickets promoted from this work:** D1→`TASK-dedup-route-handler-boilerplate-via-shared-route-factory`,
D2→`TASK-refactor-llm-provider-adapters-onto-shared-base-factory`, D3→`TASK-single-source-of-truth-for-config-schema-mirrors`,
D4→`TASK-consolidate-template-constants-under-global-all-constants-um`, D5+D6→`TASK-dedup-invites-redeem-and-auth-form-flows`,
D7→`TASK-extract-htmx-view-fragments-from-duplicated-html-views`.

### Bug Bucket Audits (strict re-review)

- **`audit-batch-A-message-seen-gen-2026-09-03.md`** — Bucket A
  (security/perf) audit findings: residual defects after the Bucket A
  commits landed (`c9ca8edd`, `d789df42`, `c1cd4d8b`, etc.). Includes
  follow-up tickets (`TASK-audit-follow-up-*`) that the audit surfaced.
- **`audit-batch-B-config-size-2026-09-03.md`** — Bucket B audit:
  historical evidence on `BUG-check-parallel-gpg-preflight-crashes-on-undefined-m`
  and the dprint/run order resolution.
- **`audit-batch-C-rbac-refactor-2026-09-03.md`** — Bucket C audit: the
  **BLOCKING** finding that the `b997e8bd` `failGeneration` cleanup
  introduces a duplicate-generation regression under DB outage. Tracked
  separately by the security/perf follow-up queue.

### Worktree Planning & Handoff Reports

- **`bugfix-worktrees-summary.md`** — Aug-28 plan summary for 5
  bucket worktrees (`fix-message-seen-batch`, `fix-chat-routes-batch`,
  `fix-csrf-hardening-batch`, `fix-character-avatar-idor`,
  `fix-middleware-async-cancellation`). Useful as historical record of
  scope partitioning across parallel sessions.
- **`bugfix-batch-2026-09-01-report.md`** and
  **`bugfix-batch-2026-09-01-batch-2-report.md`** — bucket-batch status
  snapshots from the early-Sep push.
- **`feat-bug-triage-batch-2-handoff.md`**,
  **`feat-stop-and-respond-interrupt-handoff.md`** — feature-flag
  rollout handoffs from prior sessions.
- **`fix-csrf-hardening-batch-status.md`** — CSRF hardening batch state.
- **`next-batch-2026-09-02-plan.md`** — Sep 2 batch plan.
- **`tree-finalization-candidates.md`** — worktree finalize candidates.
- **`session-summary-2026-09-02.md`** — session summary snapshot.
- **`fix-alpine-chat-view-crash.md`** — Bucket A fix report for the
  alpine init crash (`0c39d4f3`).

### Design Notes

- **`gpg-unlock-ergonomics-design.md`** — design note for the
  `assertGpgUnlocked` helper. Implementation shipped via `8b3656db`
  (Bucket C: `fix(worktree): assertGpgUnlocked on every signing path`).
  This doc captures the design rationale that didn't fit in the commit
  message.

## When to Add to This Index

When research/audit artifacts in `.tmp/` warrant durable storage, copy them
here with a `YYYY-MM-DD-*` filename suffix and add an entry above. Per
`AGENTS.md` scratchpad rule, `.tmp/` itself is auto-cleanup; this directory
is the canonical retention point.
