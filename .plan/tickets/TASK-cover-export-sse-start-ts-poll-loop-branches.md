<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Cover export-sse start.ts poll-loop branches

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Raise `src/routes/export-sse/start.ts` from 76.9% (93/121) to the 80% diff-scoped floor and delete the `routes:src/routes/export-sse/start.ts` waiver (floor 76) added for the fix-asset-urls-v1 lane.

Uncovered branches (lcov, check-gate run .tmp/run-1316133-mvx3h889): `!userId` 401 (lines 45-48 — unreachable in solo-mode test env, resolveUserIdFromRequest falls back to the demo identity and returns 200); background catch `log()?.error` (69-74); log helper (18-22); poll-loop missing-job teardown (116-118), safeEnqueue/close early-returns (99, 105, 108-109, 117, 135), failed-event frame (148-153, 155).

Candidate approaches: (a) injection seam for a failing processExport so the live stream emits the failed terminal frame (the live void processor wins the race against registry-flip attempts); (b) mock.module-gated strict suite (STRICTLY_ISOLATED, same pattern as generate-route coverage suites). Constraint: mock.module doubles are process-global/first-wins — must be describeOrSkipStrict-gated, never in the shared check-gate process.

**Context:**

Waiver filed for the fix-asset-urls-v1 lane: a one-line downloadUrl versioning (`/api/export/download/` → `/api/v1/export/download/`) pulled the file into the diff-scoped per-file floor, exposing pre-existing debt. The lane's sseData-framing contract test pins the failed-event payload shape but executes zero start.ts branches.

**Acceptance Criteria:**

- [ ] poll-loop failed branch covered by a live-stream test (not sseData framing)
- [ ] start.ts >= 80% under the diff-scoped gate; waiver entry deleted
- [ ] `bun run check` coverage gate green for the file
