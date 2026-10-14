<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Automatic organic stat growth and allocatable ability points on level-up

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** character-xp-leveling
**Related:** .plan/tickets/FEAT-levelservice-apply-awarded-xp-to-character-stats-and-level-u.md (its ASI bookkeeping feeds the pending-point budget here), .plan/epics/epic-character-growth.md (growth_log reuse for organic stat drift audit), .plan/epics/epic-character-core-system.md (owns the character_stats schema this writes)

**Summary:**

There is no path from XP to ability scores: `character_stats.str..cha` are set once at creation (`src/rpg/service/character-stats.ts:45`) and nothing increments them. Implement (a) automatic/organic growth — small, capped, activity-weighted stat drift for dynamic (`growth_mode='dynamic'`) actors, recorded in `growth_log` (axis='stat', before/after JSON; `src/db/schema-core.ts:430`) to stay consistent with `epic-character-growth.md`; and (b) allocatable points — track pending ASI/point budget per actor (ASI on levels 4/8/12/16/19 per `src/rpg/xp/constants.ts:55`), clamp to `ASI_MAX=20`, and expose allocation through the character/impersonation menu API used in world context (extend the existing rpg routes surface). Skill checks in `src/rpg/stats/` read `character_stats`, so the whole system benefits automatically.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
