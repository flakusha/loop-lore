<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Emotion-avatar job restart reconciliation

**Status:** In Progress
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

- [ ] Startup reconciliation is deterministic — no zombie `running` rows
  in job list/status after restart

- [ ] Failed/interrupted re-roll keeps the previous variant bound (no
  avatar-less window) — regression test

- [ ] Restart simulation test proves job status/results survive
- [ ] SSE consumers get a terminal state, not a hang

**Caveats:** partial failure, rollback, stale state, idempotency, observability
