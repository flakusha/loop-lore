<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Timeline steering: close roll race and empty timelineId gap

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🟡 In Progress
**Priority:** Medium
**Effort:** Medium

## Summary

Self-review of G2 merge (257010652) found two non-blocking gaps in src/story/timeline/event-steering.ts: (1) rollSteering/resolveSteering read-modify-write plus appendTimelineEvents are not transactional — two concurrent manifest rolls both pass the pending check and append duplicate timeline events. Fix: wrap in a Kysely transaction with the status read inside. (2) createSteering passes empty-string timelineId through (?? only catches null/undefined). Fix: normalize empty to prime or reject. Add tests: concurrent double-roll manifests once; empty timelineId normalizes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Progress (2026-09-11)

Landed commits:

- `f3e214e15` — docs(plan): add timeline steering task ticket
- `8d93c1bfa` — chore(plan): regenerate code-map after plan:sync --fix relocation
- `257010652` — feat(timeline): forward event steering and cross-story convergence

Still missing:

- (1) `rollSteering`/`resolveSteering` read-modify-write race not wrapped in Kysely transaction — concurrent manifest rolls both pass pending check and append duplicate timeline events
- (2) `createSteering` passes empty-string `timelineId` through (`??` only catches null/undefined) — needs normalization to prime or rejection
