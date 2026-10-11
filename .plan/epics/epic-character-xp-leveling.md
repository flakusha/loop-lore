<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character XP, Leveling & Stat Progression in World

**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** rpg, xp, leveling, stats, progression, world, autonomous-actors
**Parent Epic:** RPG Mechanics & Extensible Game Systems (epic-rpg-mechanics.md)

## Summary

Make XP and leveling a live, in-world mechanic. Directive scope:

- **XP for gameplay actions** — battles/encounters, quests and skill challenges,
  world travel, discoveries, interactions, and skill usage all grant XP through
  one shared pipeline.
- **Two stat-growth modes** — automatic organic stat growth for dynamic
  characters (small, activity-weighted, capped) AND allocatable stat/level
  points (D&D 5e ASI schedule) spent through the character/impersonation menu
  in world context.
- **Decision-based leveling for autonomous LLM actors** — when an actor crosses
  a level threshold, a pending level-up decision is staged that the actor
  resolves through its own decision flow (ability split, skill specialization),
  with an affinity/algorithm-based auto-leveling mode (highest-usage governing
  ability, combat-alignment weighting) so autonomous play is never blocked.

## Current State (verified 2026-10-11)

The math exists; the wiring does not.

| Surface | Status | Where |
| --- | --- | --- |
| XP math (thresholds, award, level-from-XP) | Exists, unwired | `src/rpg/xp/calculation.ts` (`awardXp` :72, `levelFromXp` :52, `canLevelUp` :38, `xpToNextLevel` :24), `src/rpg/xp/constants.ts` (`XP_BY_LEVEL` :5, `MAX_LEVEL` :29, `ASI_LEVELS` [4,8,12,16,19] :55), `src/rpg/xp/sources.ts` (`XP_BY_CR` :9, `xpForEnemyDefeat` :43, `xpForQuest` :59, `xpForSkillChallenge` :80), `src/rpg/xp/levelup.ts` (`hpOnLevelUp` :15, `grantsAsi` :33, `asiRemaining` :42) |
| XP ledger table | Shipped | `xp_ledger` — `src/db/schema-core.ts:996` (id, actor_id, amount, source, description, reference_id, chat_id, created_at; migration `src/db/migrations/001_init.ts:2902-2960`) |
| Ledger service | Shipped | `logXp` / `getXpHistory` — `src/rpg/service/xp.ts:22,52` |
| Manual XP REST routes | Shipped | `src/routes/rpg/xp-loot.ts:47-156` — `POST /api/rpg/xp/award`, `GET /api/rpg/xp/history`, `POST /api/rpg/xp/level`, `POST /api/rpg/xp/next`; award requires caller-supplied `currentLevel`/`currentXp` and never touches `character_stats` |
| Character progression state | Shipped (frozen) | `character_stats` — `src/db/schema-core.ts:488` (level, hp/max_hp, str/dex/con/int/wis/cha, hit_dice, xp, xp_to_next, combat_alignment); written once at creation via `src/rpg/service/character-stats.ts:45`; nothing updates level/xp afterwards |
| Skill XP (per-skill rows) | Shipped | `character_skills` — `src/db/schema-core.ts:466`; `addXp`/`specializeSkill` — `src/rpg/skills/service/progression.ts:19,81` (shared `SkillsService` path) |
| Production XP awarders | NSFW/encounter only | `src/rpg/seduction/service/settle.ts:69-78` (source `nsfw_seduction`, consolation XP on failure), `src/rpg/encounters/service/participant-legs.ts:100-112` (source `nsfw_encounter`); achievement `experience` reward type is an intentional no-op — `src/rpg/achievements/service/reward-apply.ts:36` wires only `story_points` |
| Combat character XP | Not Started | `xpForEnemyDefeat`/`XP_BY_CR` have zero production callers; battle resolution (`src/battle/resolution-integration/`) grants nothing |
| Quest / skill-challenge / discovery / travel XP | Not Started | `xpForQuest`, `xpForSkillChallenge` unwired; `src/rpg/world-travel/` and `src/rpg/world-discovery/` contain no XP calls |
| Organic stat growth | Not Started | `str..cha` immutable after creation |
| Allocatable stat/level points | Not Started | no pending-ASI tracking, no allocation endpoint, no character/impersonation menu surface |
| Autonomous level-up decisions / affinity auto-leveling | Not Started | — |

Known hazards pinned by tests: skill `awardXp` accepts negative/NaN/Infinity XP
(`src/rpg/seduction/service.test.ts:181-223`;
`.plan/tickets/BUG-addxp-accepts-negative-xp-producing-nan-level-stored-in-db.md`).

## Ownership Boundaries

This epic owns the mechanical XP→level→stat pipeline only. It does NOT duplicate:

- `epic-rpg-progression.md` — traits, skill trees/points, buffs/debuffs engine
  (`StatusEffect` contract stays there). That epic owns trait/skill-point growth;
  this epic owns the XP→level threshold that feeds it.
- `epic-character-growth.md` — narrative growth (`growth_mode`, `character_arc`,
  `growth_log`, trait drift, relationship evolution). Stat-growth events in this
  epic REUSE `growth_log` for audit but the triggering semantics live here; the
  narrative-growth semantics stay there.
- `epic-character-core-system.md` — owns the `character_stats` schema and its
  CRUD/stat read helpers (`src/rpg/service/character-stats.ts`, `src/rpg/stats/`);
  this epic only writes level/xp/ability increments through them.
- `epic-exploration-discovery.md` — discovery/travel mechanics themselves; this
  epic only adds the XP reward leg to their completion events, which that epic
  emits without awarding anything.
- `epic-quests-encounters.md` — quest generation/tracking; this epic only adds
  the quest-completion XP reward, hooked into that epic's completion events.
- `.plan/epics/epic-battle-action-systems.md` (Spells & Skills sub-epic — the
  referenced `epic-spells-skills.md` split target has no standalone file yet) —
  spell casting and battle-side skill rolls; battle VICTORY XP belongs here.

### Related Epics

Two-way connections beyond the boundaries above:

- `.plan/epics/epic-battle-action-systems.md` — its dependency table already
  expects "XP rewards, level-up after combat" from RPG mechanics; battle
  resolution (`src/battle/resolution-integration/`) stays theirs, the
  character-XP grant leg is the battle-rewards ticket here.
- `.plan/epics/epic-nsfw-game-mechanics.md` — the only production XP awarders
  today live on its side (`src/rpg/seduction/service/settle.ts`,
  `src/rpg/encounters/service/participant-legs.ts`); they keep owning the award
  triggers, this epic owns the pipeline those triggers call into.
- `.plan/epics/epic-actor-autonomy-story-drive.md` — autonomous actors resolve
  staged level-up decisions through that epic's decision/turn machinery; this
  epic stages the pending decision, that epic owns how an actor settles it.

## Unticketed Gaps

- `logXp` never updates `character_stats` level/xp/xp_to_next — the ledger and
  the character sheet are disconnected stores today.
- No level-up application anywhere: `hpOnLevelUp`/`grantsAsi`/`asiRemaining`
  have no production callers.
- Battle resolution awards no character XP despite `xpForEnemyDefeat` existing.
- `xp_ledger.source` is a free string with no vocabulary and no idempotency key
  (contrast `quest_reward_ledger.ledger_key`, `src/rpg/loot/persist.ts:95-123`).

## Tasks

- [ ] LevelService: apply awarded XP to `character_stats` and level-up benefits — `FEAT-levelservice-apply-awarded-xp-to-character-stats-and-level-u.md` (Not Started)
- [ ] Battle rewards: grant character XP on enemy defeat — `FEAT-battle-rewards-grant-character-xp-on-enemy-defeat.md` (Not Started)
- [ ] XP sources for quests, skill challenges, discovery, and travel — `FEAT-xp-sources-for-quests-skill-challenges-discovery-and-travel.md` (Not Started)
- [ ] Automatic organic stat growth and allocatable ability points on level-up — `FEAT-automatic-organic-stat-growth-and-allocatable-ability-points.md` (Not Started)
- [ ] Level-up decision interface for autonomous LLM actors with affinity auto-allocation — `FEAT-level-up-decision-interface-for-autonomous-llm-actors-with-a.md` (Not Started)
- [ ] Progression API and character menu surface for XP, level, and stats in world — `FEAT-progression-api-and-character-menu-surface-for-xp-level-and-.md` (Not Started)
- [ ] Skill usage XP: award skill and character XP when skills are exercised — `FEAT-skill-usage-xp-award-skill-and-character-xp-when-skills-are-.md` (Not Started)
- [ ] Integrate skill progression with LevelService as one guarded award pipeline — `FEAT-integrate-skill-progression-with-levelservice-as-one-guarded.md` (Not Started)
- [ ] Gate XP and skill XP awards behind the per-world rpg_xp opt-in — `FEAT-gate-xp-and-skill-xp-awards-behind-the-per-world-rpg-xp-opt-.md` (Not Started)
- [ ] Per-world skills mechanic flag and world-creation opt-in UI — `FEAT-per-world-skills-mechanic-flag-and-world-creation-opt-in-ui.md` (Not Started)
