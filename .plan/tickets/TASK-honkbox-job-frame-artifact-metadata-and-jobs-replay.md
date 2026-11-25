<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox job frame artifact metadata and jobs replay

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Tags:** honkbox
**Epic:** epic-platform-integrations
**Caveats:** the replay window must be bounded (memory) — snapshot-or-bounded-replay, not a full log; the wire change must be additive-only so older consumers keep working (loop-lore parses unknown keys safely today); dropped-frame recovery depends on the snapshot actually listing artifact ids, so until it lands the reconcile path keeps failing closed with a named error, never a silent success.

**Summary:**

Honkbox's `job_result` SSE frame now carries selection metadata additively: `artifact_id`/`sha256`/`size_bytes` plus `artifact_name`/`artifact_kind`/`artifact_index`/`artifact_primary` (`crates/api-types/src/lib.rs:2535-2548`, emitter `crates/server/src/jobs_registry.rs:362-398`). Each live `GET /v1/jobs` entry exposes `artifacts: Option<Vec<JobArtifactRef>>` — id, name, kind, index, primary, bounded to 64 (`api-types/src/lib.rs:2373-2388`, `2414-2419`); still a liveness snapshot, not a replay log.

Consequences on the loop-lore side (this ticket is the consumer): the shipped wire now supports metadata-driven multiframe selection and snapshot-based dropped-frame recovery. Remaining work is the loop-lore consumer, implemented in worktree `tree/honkbox-job-result-metadata-consumer-2026-11-23` at `23f309e75` (NOT landed): parser/type, selector (explicit id → primary → lowest index → first), and `reconcileJobResult` for `artifacts[]` + legacy rows in `src/integrations/honkbox/result-ingest.ts`. The earlier first-frame-only selection lane (`e48944342`) is superseded.

Honkbox-side wire enrichment is SHIPPED (additive `job_result` metadata + bounded artifact ids on the live jobs snapshot); no honkbox-side work remains. Only landing the unlanded consumer commit above is open.

**Acceptance:**

- frames carry selection metadata (kind, filename, index or primary flag).
- the jobs snapshot answers "which artifact ids did job X produce".
- loop-lore selection prefers explicit primary/artifact-id and the dropped-frame reconcile path can recover.
- wire change is additive; loop-lore parses unknown keys safely today.

**Context:**

Evidence (verified 2026-11-23, current honkbox tree): `JobArtifactRef` carries
artifact_id/name/kind/index/primary (`api-types/src/lib.rs:2373-2388`); `JobInfo.artifacts`
is snapshot-only, bounded to 64 (`api-types:2414-2419`); `JobEvent` carries
artifact_name/kind/index/primary (`api-types:2535-2548`); `emit_result` fills both (`jobs_registry.rs:362-398`).
Wire reviewed under `23f309e75`. Consumer (unlanded): `tree/honkbox-job-result-metadata-consumer-2026-11-23`
@ `23f309e75` extends `src/integrations/honkbox/result-ingest.ts` parser/type, selector and
`reconcileJobResult` for `artifacts[]` + legacy rows; 57 pass / 0 fail, gates clean.
Related: TASK-honkbox-generation-result-delivery-and-asset-ingest.md
(frozen wire contract this enriches).

git issue: 9368a8d

**Acceptance Criteria:**

- [x] `job_result` frames carry kind/filename/index-or-primary metadata, additively. (shipped: `JobEvent` artifact_* fields, api-types:2535-2548; emitter jobs_registry.rs:362-398; reviewed under `23f309e75`.)
- [x] `GET /v1/jobs` (or a bounded replay route) answers which artifact ids a job produced. (shipped: `JobInfo.artifacts`, api-types:2414-2419 — bounded liveness snapshot, no full replay route.)
- [x] loop-lore multiframe selection prefers explicit primary/artifact-id over first-frame. (unlanded consumer `23f309e75`: id → primary → lowest index → first.)
- [x] A dropped frame is reconcilable from the snapshot/replay; reconcile failure stays a named error. (unlanded consumer `23f309e75`: `artifacts[]` + legacy rows.)
- [x] Targeted honkbox integration tests pass against enriched and legacy frames. (57 pass / 0 fail in consumer worktree.)
- [ ] Land consumer worktree `23f309e75` to dev — deferred (no finalize/land in this lane); ticket stays In Progress. Snapshot is bounded liveness (64), not a full replay log.

## Engine research addendum (2026-11-25)

- Current code already selects and reconciles metadata from enriched frames; do not file a duplicate single-artifact consumer.
- Bounded snapshot replay is telemetry, not publication proof; all-manifest multi-artifact ingest is a separate gated candidate (P6).
