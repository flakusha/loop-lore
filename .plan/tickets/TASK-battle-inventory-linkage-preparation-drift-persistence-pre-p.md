<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Battle-inventory linkage: preparation drift persistence pre/post battle

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Decides the inventory<->battle contract. Verified: battle<->inventory link EXISTS for consumables (listUsableBattleItems/useBattleItem in src/rpg/service/battles/items.ts, atomic consume+persist txn, 3 known race BUGs pinned in tests). Item stat drift infra EXISTS separately (applyDrift in src/story/items/instance-state.ts, capped per rarity/category, battleUses counter) but NO caller passes battle events into applyDrift - preparation/consumption never persists stat/skill drift. Decide: (a) pre-battle preparation phase (equip/buff/consumable staging - new UX or reuse /battle use), (b) which battle events emit ItemDriftEvent (per-use wear, victory tempering, defeat damage), (c) whether drift applies to actor stats/skills too or items only, (d) persistence timing (per-action inside battle txn vs post-battle settlement batch). Blocks implementation.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
