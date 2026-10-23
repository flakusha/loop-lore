<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: acceptResponse applies world events before the turn write, so a rejected turn keeps applied world mutations

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-assistant-gm-flows

**Summary:**

Location: src/story/game-master/accept.ts:58-63 (applyEvents on state.db) vs :101-124 (turn update).

Evidence: applyEvents({ db: state.db, ... }) at :61 - the trx parameter the events API supports (src/story/events/application/apply.ts:26-27: const database = trx ?? db) is unused; the later turn update can throw (TransitionError at :104, DB failure at :107-124), leaving world mutations + timeline rows persisted for a turn that was never accepted.

Verification: CODE-READ - trace: accept.ts:58-62 (applyEvents with no trx key) -> :101-104 (status-machine check can throw new TransitionError AFTER events are applied) -> :107-124 (turn UPDATE, independent write); apply.ts:26-27 re-read verbatim (the trx seam exists, unfed). Executing needs a live DB + turn state machine; the write ordering is fully determined by the read.

Impact: world state and timeline drift for turns the GM ultimately rejected - no rollback path.

Fix: wrap applyEvents + the turn update in one db.transaction() and pass the trx through to applyEvents.

Source: .tmp/glm-review/deep-story-crypto-1015.md F-5 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
