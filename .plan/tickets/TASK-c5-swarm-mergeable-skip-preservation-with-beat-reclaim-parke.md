<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: C5: Swarm-mergeable skip preservation with beat reclaim (parked)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-instance-federation
**Tags:** composition, matrix-c5

**Summary:**

**Status:** Postponed
**Priority:** low
**Effort:** Medium
**Summary:** Additive kind plus beat_id plus skip-marker JSON payload fields (header untouched, old peers ignore unknown fields); merges preserve consumption (skipped beats stay consumed, no narration-to-action downgrade) and the freed beat is offered to the GM scheduler via the 02-#9 hook. PARKED regardless of score.
**Context:** Composes B5 (sealContent opaque payload, src/federation/envelope.ts:41) + B2 (recordTurnSkip/countTurnSkipsForActor) + B6 (selectNextGroupActor). Phase-1 slice when unparked: src/federation/fan-out.ts payload fields + turn-skip.ts merge-side consumer + test. Score 2 (V2/E2/R2/U1), band later. Score is priority, not size approval, per 05 section 5.
**Acceptance Criteria:** postponed -- no acceptance work until C1-engine/C2-clock decisions land; on revisit, kind plus beat_id payload fields preserve skip consumption across merges with GM-scheduler reclaim via 02-#9 hook.
**Parents:** 02-#9 x 03-X5. 02x03 chain 3/3.
**X-map:** 03-X5 inherits the same C1-engine/C2-clock block; do NOT file X5 separately.
**Related:** Builds on TASK-c2-bridged-turn-skip-propagation-bridge-only plus 02-#9; siblings TASK-c1-moderation-action-notices-with-actor-thumb, TASK-c4-inbound-federated-content-verdict-notices.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
