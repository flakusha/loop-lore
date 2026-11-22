<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox job frame artifact metadata and jobs replay

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Tags:** honkbox
**Epic:** epic-platform-integrations
**Caveats:** the replay window must be bounded (memory) — snapshot-or-bounded-replay, not a full log; the wire change must be additive-only so older consumers keep working (loop-lore parses unknown keys safely today); dropped-frame recovery depends on the snapshot actually listing artifact ids, so until it lands the reconcile path keeps failing closed with a named error, never a silent success.

**Summary:**

Honkbox's `job_result` SSE frame carries only `artifact_id`/`sha256`/`size_bytes` (`crates/api-types/src/lib.rs:2488-2496`, emitter `crates/server/src/jobs_registry.rs:335-350`) — no kind, filename, index, or primary flag. `GET /v1/jobs` (JobInfo, api-types:2362-2382) exposes no artifact id; it is a liveness snapshot, not a replay log (api-types:2450-2545).

Consequences on the loop-lore side (this ticket is the consumer): multiframe artifact selection cannot be metadata-driven — loop-lore currently ships first-frame selection (artifact-selection lane, worktree honkbox-artifact-selection commit e48944342, unlanded) — and a dropped frame is unrecoverable because `src/integrations/honkbox/result-ingest.ts` `reconcileJobResult` can never find the artifact for a job whose snapshot names none.

Honkbox-side wire enrichment: add kind/filename/index-or-primary flag to `job_result` frames, and artifact ids to the `GET /v1/jobs` snapshot (or a bounded replay window).

**Acceptance:**

- frames carry selection metadata (kind, filename, index or primary flag).
- the jobs snapshot answers "which artifact ids did job X produce".
- loop-lore selection prefers explicit primary/artifact-id and the dropped-frame reconcile path can recover.
- wire change is additive; loop-lore parses unknown keys safely today.

**Context:**

Evidence (verified 2026-11-22): frame fields `artifact_id`/`sha256`/`size_bytes`
only (api-types:2488-2496, jobs_registry.rs:335-350); JobInfo carries no
artifact id (api-types:2362-2382, snapshot semantics api-types:2450-2545).
loop-lore consumers: `src/integrations/honkbox/result-ingest.ts`
`reconcileJobResult`; multiframe selection lane unlanded at e48944342.
Related: TASK-honkbox-generation-result-delivery-and-asset-ingest.md
(frozen wire contract this enriches).

git issue: 9368a8d

**Acceptance Criteria:**

- [ ] `job_result` frames carry kind/filename/index-or-primary metadata, additively.
- [ ] `GET /v1/jobs` (or a bounded replay route) answers which artifact ids a job produced.
- [ ] loop-lore multiframe selection prefers explicit primary/artifact-id over first-frame.
- [ ] A dropped frame is reconcilable from the snapshot/replay; reconcile failure stays a named error.
- [ ] Targeted honkbox integration tests pass against enriched and legacy frames.
