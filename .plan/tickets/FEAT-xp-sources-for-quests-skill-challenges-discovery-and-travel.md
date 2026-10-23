<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: XP sources for quests, skill challenges, discovery, and travel

**Status:** Done
**Status Note:** quest/discovery/travel legs shipped on dev — `src/story/quest-engine/xp.ts:36`, `src/rpg/world-discovery/xp-leg.ts:34`, `src/rpg/world-travel/migration.ts:57`; skill-challenge leg (`xpForSkillChallenge`, `src/rpg/xp/sources.ts:104`) has no production caller — follow-up pending; verified 2026-10-23
**Priority:** high
**Effort:** Medium
**Caveats:** idempotency — grants are keyed per reference_id where the leg supports it; skill-challenge awards have no production path, so that source string is currently unused
**Epic:** character-xp-leveling
**Related:** .plan/epics/epic-quests-encounters.md (owns quest completion events this hooks), .plan/epics/epic-exploration-discovery.md (owns discovery/travel completion events this hooks), .plan/tickets/FEAT-levelservice-apply-awarded-xp-to-character-stats-and-level-u.md (grants persist through this service)

**Summary:**

`xpForSkillChallenge` (`src/rpg/xp/sources.ts:80-92`) and `xpForQuest` (`src/rpg/xp/sources.ts:59-72`) are pure functions with zero production callers. Hook them into the systems that already emit completion events: quest/encounter completion (alongside `quest_reward_ledger` loot persistence in `src/rpg/loot/persist.ts:95-123`), world-discovery first discoveries (`src/rpg/world-discovery/discovery.ts` + `progress.ts`), and successful world-travel legs (`src/rpg/world-travel/travel.ts`/`walk.ts`). Each grant writes `xp_ledger` with a distinct source string (`quest`, `discovery`, `travel`, `skill_challenge`) + reference_id. Keep grants idempotent per reference_id (pattern: `quest_reward_ledger.ledger_key`).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-23 registry-driven close: git issue 0d94df3 (registry tip: 2e1851f0b Konstantin Fedotov Auto-closed: appended .md marker marks FEAT-XP-SOURCES-FOR-QUESTS-SKILL)
