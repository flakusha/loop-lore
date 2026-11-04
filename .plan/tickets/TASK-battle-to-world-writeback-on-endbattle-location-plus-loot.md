<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Battle-to-world writeback on endBattle (location plus loot)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

endBattle (src/rpg/service/battles.ts) writes battle-row status only — no location change, no auto-loot (loot is a separate POST .../equipment/loot). Retreat is /battle end abandoned or NPC flee. Epic: epic-display-transitions (task 4). Research: .tmp/research/2d-canvas-3d-world/transitions.md section T2.6. Acceptance: winning/retreating writes actor location + mints loot into world_items in the same transaction as battle close; idempotent on retry; empty-roster refusal path unchanged. Related: FEAT-2d-world-shared-battle-entrance-rule-table-chat-sprite + TASK-2d-world-review-reconcile-shared-battle-entrance-table-with- (entrance half), encounter-routes.ts:198 outcome path. Caveats: writeback must not double-mint on SSE retry; ambush short-prep-beat (B3) preserved; loot tables stay server-authoritative, never client-supplied.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
