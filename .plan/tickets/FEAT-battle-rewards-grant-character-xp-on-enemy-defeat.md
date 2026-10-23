<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Battle rewards: grant character XP on enemy defeat

**Status:** Done
**Status Note:** shipped on dev — battle victory leg at `src/rpg/service/battles/rewards.ts:70` (source `combat` :73); verified 2026-10-23
**Priority:** high
**Effort:** Medium
**Caveats:** partial failure — reward failure never fails battle resolution (best-effort try/catch); observability — one `xp_ledger` row per surviving participant
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

**Resolved:** 2026-10-23 registry-driven close: git issue c284d3d (registry tip: 58554aeeb Konstantin Fedotov Auto-closed: appended .md marker marks FEAT-BATTLE-REWARDS-GRANT-CHARAC)
