<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Emotion-avatar job restart reconciliation

**Status:** Done
**Status Note:** [2026-10-30, worktree feat-emotion-avatar-completion] Startup sweep `reconcileInterruptedJobs` in `src/characters/services/emotion-avatar-service/restart-reconcile.ts`, wired in `src/server/start.ts` right after `runDataMigrations` (before seeding/traffic). Design: interrupted jobs are terminal, never resumed; the reason rides the existing `generation_jobs.error_message` column (`restart_interrupted`) — no migration; committed per-slot `results` are preserved by the UPDATE never touching them. Sweep scope is `kind = "emotion-avatar"` and `status = "running"` only (records insert directly as running). The in-memory job store stays a cache and is rebuilt from the durable rows at startup (`rebuildJobCache` in `job-store.ts`), so list/status serve reconciled state and an SSE consumer of a reconciled job gets the terminal snapshot + `done` and a closed stream (no hang) — proven by reading `handleJobStream`'s body to completion in the test. No cron safety net added (boring option: the boot sweep is deterministic; nothing can observe a zombie between boot steps because the readiness gate still 503s). Restart simulation is file-backed SQLite with a fresh Kysely + `runMigrations` on reopen, mirroring `rotation-restart.test.ts`; it also pins that a foreign `generation_jobs` kind stays untouched and that the interrupted re-roll's previous variant binding survives. Scoped tests: `bun test src/characters/services/emotion-avatar-service/restart-reconcile.test.ts` (3 pass), `bun test src/characters/services/emotion-avatar-service/ src/server/start.test.ts` (24 pass, 37 skip — isolated-only suites skip in default mode), `bun test --isolate src/characters/services/emotion-avatar-service/` (50 pass), `bun run typecheck` green. [2026-10-30 fix set] F1 count field: installed Kysely exposes `numUpdatedRows` (not `numUpdatedOrDeletedRows`), so the sweep now accepts either field plus an `isSafeInteger` guard — zero-count regression caught by the existing tests. F2 claim guard `.where("error_message", "is", null)` already in place: first writer wins, second pass is a no-op. F3 covered by the `already-claimed running row is not double-swept` test (running + `restart_interrupted` row excluded, untouched). Scoped: `bun test src/characters/services/emotion-avatar-service/restart-reconcile.test.ts` (4 pass), `bun run typecheck` green.
**Scope:** Emotion-Avatar Completion
**Priority:** medium
**Effort:** Medium
**Epic:** epic-avatar-regeneration-control

**Summary:**

Reconcile orphaned `running` emotion-avatar generation jobs at server
start. A crash or restart mid-generation leaves zombie `running` rows in
`generation_jobs`; nothing today transitions them to a terminal state.

**Context:**

Epic: epic-avatar-regeneration-control (open work item: Persistent job
store). The in-memory job store is a cache over `generation_jobs`
(`src/characters/services/emotion-avatar-service/job-store.ts`,
`job-records.ts`); the HTTP surface lives in
`src/routes/character-emotion-avatars.ts`. Jobs are durable but their
lifecycle is not reconciled across restarts.

**Approach**

- At server start, sweep `generation_jobs` rows still `running` from a
  previous process and mark them failed with an explicit reason (e.g.
  `restart_interrupted`), preserving any per-slot results already
  committed.

- Decide and document: interrupted jobs are terminal (not resumed);
  the in-memory job store remains a cache over `generation_jobs` and is
  rebuilt/invalidated from the durable rows at startup.

- Include restart-durable job status coverage.

**Acceptance Criteria:**

- [x] Startup reconciliation is deterministic — no zombie `running` rows
  in job list/status after restart

- [x] Failed/interrupted re-roll keeps the previous variant bound (no
  avatar-less window) — regression test

- [x] Restart simulation test proves job status/results survive
- [x] SSE consumers get a terminal state, not a hang

**Caveats:** partial failure, rollback, stale state, idempotency, observability
