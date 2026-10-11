<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Battle rewards: grant character XP on enemy defeat

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** character-xp-leveling
**Related:** .plan/tickets/FEAT-levelservice-apply-awarded-xp-to-character-stats-and-level-u.md (grants persist through this service), .plan/epics/epic-battle-action-systems.md (owns battle resolution — this adds only the character-XP grant leg)

**Summary:**

Nothing in `src/battle/` or `src/rpg/combat/` awards character XP today — `xpForEnemyDefeat`/`XP_BY_CR` (`src/rpg/xp/sources.ts:9-51`) have no production callers. Wire battle resolution to grant XP to surviving participants via the new LevelService: CR lookup from the defeated foe, party-size split, assist half-XP, ledger source `combat`, reference_id = battle id, chat_id from the battle's chat. A coverage test mirrors the encounters participant-legs pattern (one `xp_ledger` row per participant; best-effort try/catch so reward failure never fails resolution — cf. `src/rpg/encounters/service/participant-legs.ts:100-112`).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
