<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Cover new-chat selection.ts DOM functions

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The alternate-greeting-picker branch adds fully-tested pure helpers to src/frontend/pages/new-chat/selection.ts, but the file's pre-existing DOM render/handler functions (renderSelected, renderResults, updateMemoryCarryVisibility, removeParticipant, selectActor, selectActorFromList, bindSelectionHandlers) have no unit tests, leaving the diff-touched file at ~23% under the scoped coverage gate. A per-file dom-bound waiver floors it until these functions gain FakeEl-style tests following greeting-picker.test.ts. Retire the waiver when done.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
