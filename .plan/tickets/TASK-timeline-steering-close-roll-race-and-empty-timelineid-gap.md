<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Timeline steering: close roll race and empty timelineId gap

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** [2026-10-30, feat-timeline-remainder] Both gaps closed. (1) `rollSteering`/`resolveSteering` now run the pending-status read INSIDE `db.transaction()` together with the status flip + `appendTimelineEvents` (src/story/timeline/event-steering.ts), so a concurrent double-roll can no longer both observe Pending; covered by the new "concurrent double-roll manifests exactly one timeline event" test. (2) `createSteering` rejects an empty/whitespace `timelineId` with a clear error (documented via `@throws`) instead of seeding an orphan branch id — reject chosen over coerce because the only non-test caller (src/story/plot-autopilot.ts) omits `timelineId`, and the function already rejects an empty `description`; covered by "rejects an empty timelineId instead of persisting it". Suite: bun test src/story/timeline/event-steering.test.ts — 14 pass / 0 fail (12 pre-existing + 2 new). Gates: typecheck - backend, typecheck - frontend, lint - eslint, format - dprint, fe-be - harmony — all PASS.
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-timeline-system

## Summary

Self-review of G2 merge (257010652) found two non-blocking gaps in src/story/timeline/event-steering.ts: (1) rollSteering/resolveSteering read-modify-write plus appendTimelineEvents are not transactional — two concurrent manifest rolls both pass the pending check and append duplicate timeline events. Fix: wrap in a Kysely transaction with the status read inside. (2) createSteering passes empty-string timelineId through (?? only catches null/undefined). Fix: normalize empty to prime or reject. Add tests: concurrent double-roll manifests once; empty timelineId normalizes.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (@throws JSDoc + ticket status note)

## Progress (2026-09-11)

Landed commits:

- `f3e214e15` — docs(plan): add timeline steering task ticket
- `8d93c1bfa` — chore(plan): regenerate code-map after plan:sync --fix relocation
- `257010652` — feat(timeline): forward event steering and cross-story convergence

Still missing:

- (1) `rollSteering`/`resolveSteering` read-modify-write race not wrapped in Kysely transaction — concurrent manifest rolls both pass pending check and append duplicate timeline events
- (2) `createSteering` passes empty-string `timelineId` through (`??` only catches null/undefined) — needs normalization to prime or rejection

**Resolved:** 2026-10-30 registry-driven close: git issue 18bb7ff (registry tip: df864f465 Konstantin Fedotov Close issue)
