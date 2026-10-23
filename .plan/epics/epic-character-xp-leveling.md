<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character XP, Leveling & Stat Progression in World

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** Core pipeline shipped on dev (LevelService + 5 award legs + ASI/decisions + progression REST API); pending surface: skill-challenge leg, skill fan-in/usage XP, per-world xp/skills gates, chat ASI wiring, panel buttons (verified 2026-10-23)
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

## Current State (verified 2026-10-23)

The math is wired: `LevelService.awardXpToActor` persists XP to `character_stats`, applies level-up benefits, and is called by 5 production legs. Remaining work is surface, not pipeline: skill-challenge XP leg, skill-row fan-in/usage XP, per-world xp/skills gates, chat ASI answer wiring, panel buttons.

| Surface | Status | Where |
| --- | --- | --- |
| XP math (thresholds, award, level-from-XP) | Shipped, wired | `src/rpg/xp/calculation.ts` (`awardXp` :72, `levelFromXp` :52, `canLevelUp` :38, `xpToNextLevel` :24), `src/rpg/xp/constants.ts` (`XP_BY_LEVEL` :5, `MAX_LEVEL` :29, `ASI_LEVELS` [4,8,12,16,19] :55), `src/rpg/xp/sources.ts` (`XP_BY_CR` :9, `xpForEnemyDefeat` :43, `xpForQuest` :59, `xpForSkillChallenge` :104), `src/rpg/xp/levelup.ts` (`hpOnLevelUp` :15, `grantsAsi` :33, `asiRemaining` :42) |
| XP ledger table | Shipped | `xp_ledger` — `src/db/schema-core.ts:996` (id, actor_id, amount, source, description, reference_id, chat_id, created_at; migration `src/db/migrations/001_init.ts:2902-2960`) |
| Ledger service | Shipped | `logXp` / `getXpHistory` — `src/rpg/service/xp.ts:22,52` |
| LevelService (character-XP pipeline) | Shipped | `awardXpToActor` — `src/rpg/level/service.ts:49` (persists level/xp/xp_to_next to `character_stats`, applies `hpOnLevelUp`/`grantsAsi` via `src/rpg/level/award.ts:117-119`, writes `xp_ledger` audit row, stages level-up decisions) |
| Organic stat growth | Shipped | `applyOrganicGrowth` — `src/rpg/level/growth.ts:75` (activity-weighted, capped at `ORGANIC_GROWTH_CAP` :30) |
| ASI allocation + pending budget | Shipped | `allocateAsi` — `src/rpg/level/asi.ts:66`; staged/applied via `stageLevelUpDecision` / `resolveLevelUpDecision` — `src/rpg/level/decisions.ts:98,141` |
| Autonomous level-up decisions / affinity auto-leveling | Shipped (service) | `autoAllocateAsi` — `src/rpg/level/decisions.ts:60`, `autoResolveIfAutonomous` — `src/rpg/level/decisions.ts:166`; chat `asi:` answer wiring pending (sibling F1 workstream) |
| Progression REST API | Shipped (service routes) | `src/routes/rpg/progression.ts` — `POST /api/rpg/progression/:actorId/award` :141, `/asi` :170, `/level-up` :199; character-menu/panel buttons pending (sibling F2 workstream) |
| Combat character XP | Shipped | battle victory leg calls `awardXpToActor` — `src/rpg/service/battles/rewards.ts:70` (source `combat` :73), driven from `src/rpg/service/battles/actions.ts:93` |
| Quest completion XP | Shipped | `awardQuestCompletionXp` — `src/story/quest-engine/xp.ts:36` calls `awardXpToActor` :69 (source `quest` :72) |
| Discovery XP | Shipped | `src/rpg/world-discovery/xp-leg.ts:34` calls `awardXpToActor` (source `discovery` :37) |
| Travel XP | Shipped | `src/rpg/world-travel/migration.ts:57` calls `awardXpToActor` (source `travel` :60) |
| Legacy awarders (pre-pipeline) | Shipped | `src/rpg/seduction/service/settle.ts:69-78` (source `nsfw_seduction`), `src/rpg/encounters/service/participant-legs.ts:100-112` (source `nsfw_encounter`); achievement `experience` reward type is an intentional no-op — `src/rpg/achievements/service/reward-apply.ts:36` wires only `story_points` |
| Skill-challenge XP | Pending | `xpForSkillChallenge` — `src/rpg/xp/sources.ts:104` has no production caller (math + tests only: `src/rpg/xp/sources.test.ts:58`, `src/rpg/xp.test.ts:150`) |
| Skill usage XP (skill + character XP on exercise) | Pending | `SkillsService.addXp` — `src/rpg/skills/service/progression.ts:19` reachable only via manual route `POST /api/rpg/skills/:id/xp` (`src/routes/rpg/skills-progression.ts:134`); no `addXp`/`SkillsService` caller in `src/rpg/interaction/` |
| Skill fan-in into character_stats | Pending | character XP (`xp_ledger` + `character_stats`) and skill-row XP (`character_skills` via `SkillsService.addXp`) share no award path; no world-gated fan-out exists on dev |
| Per-world rpg_xp gate | Pending | `RpgMechanic.Xp` (`src/rpg/service/world-gate.ts:71`) has zero production callers; `rpg_xp` is persisted and read into the config (`:61,131`) but never enforced at any award site |
| Per-world rpg_skills flag + world UI | Pending on dev | no `rpg_skills` in `schema-story.ts`/`world-gate.ts`/`world-rpg-flags.ts` on dev; flag + world-creation/edit UI exist only in the sibling F2 workstream branch |
| Manual XP REST routes | Shipped | `src/routes/rpg/xp-loot.ts:47-156` — `POST /api/rpg/xp/award`, `GET /api/rpg/xp/history`, `POST /api/rpg/xp/level`, `POST /api/rpg/xp/next` |
| Character progression state | Shipped (live) | `character_stats` — `src/db/schema-core.ts:488`; level/xp/xp_to_next now updated by LevelService on every award (frozen-at-creation era ended) |
| Skill XP (per-skill rows) | Shipped | `character_skills` — `src/db/schema-core.ts:466`; `addXp`/`specializeSkill` — `src/rpg/skills/service/progression.ts:19,81` (shared `SkillsService` path) |

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

- RESOLVED (was: `logXp` never updates `character_stats`): LevelService now persists level/xp/xp_to_next on every award — `src/rpg/level/service.ts:49` via `src/rpg/level/award.ts:117-119`.
- RESOLVED (was: no level-up application): `hpOnLevelUp`/`grantsAsi` applied in the award loop (`src/rpg/level/award.ts:117-119`); ASI budget staged/applied via `src/rpg/level/decisions.ts:98,141`.
- RESOLVED (was: battle resolution awards no character XP): victory leg grants via `awardXpToActor` — `src/rpg/service/battles/rewards.ts:70` (source `combat` :73).
- `xp_ledger.source` is a free string with no vocabulary and no idempotency key
  (contrast `quest_reward_ledger.ledger_key`, `src/rpg/loot/persist.ts:95-123`).

## Tasks

- [x] LevelService: apply awarded XP to `character_stats` and level-up benefits — `FEAT-levelservice-apply-awarded-xp-to-character-stats-and-level-u.md` (Done — shipped on dev: `src/rpg/level/service.ts:49`)
- [x] Battle rewards: grant character XP on enemy defeat — `FEAT-battle-rewards-grant-character-xp-on-enemy-defeat.md` (Done — shipped on dev: `src/rpg/service/battles/rewards.ts:70`)
- [x] XP sources for quests, skill challenges, discovery, and travel — `FEAT-xp-sources-for-quests-skill-challenges-discovery-and-travel.md` (Done — quest/discovery/travel legs shipped on dev: `src/story/quest-engine/xp.ts:36`, `src/rpg/world-discovery/xp-leg.ts:34`, `src/rpg/world-travel/migration.ts:57`; skill-challenge leg split out as pending follow-up)
- [x] Automatic organic stat growth and allocatable ability points on level-up — `FEAT-automatic-organic-stat-growth-and-allocatable-ability-points.md` (Done — shipped on dev: `src/rpg/level/growth.ts:75`, `src/rpg/level/asi.ts:66`)
- [ ] Level-up decision interface for autonomous LLM actors with affinity auto-allocation — `FEAT-level-up-decision-interface-for-autonomous-llm-actors-with-a.md` (In Progress — service shipped on dev: `src/rpg/level/decisions.ts:60,98,141,166`; blocked on sibling F1 chat `asi:` answer wiring, unlanded)
- [ ] Progression API and character menu surface for XP, level, and stats in world — `FEAT-progression-api-and-character-menu-surface-for-xp-level-and-.md` (In Progress — REST routes shipped on dev: `src/routes/rpg/progression.ts:141,170,199`; blocked on sibling F2 panel buttons, unlanded)
- [ ] Skill usage XP: award skill and character XP when skills are exercised — `FEAT-skill-usage-xp-award-skill-and-character-xp-when-skills-are-.md` (In Progress — work in branch `xp-reward-sources`)
- [ ] Integrate skill progression with LevelService as one guarded award pipeline — `FEAT-integrate-skill-progression-with-levelservice-as-one-guarded.md` (In Progress — work in branch `xp-level-pipeline`)
- [ ] Gate XP and skill XP awards behind the per-world rpg_xp opt-in — `FEAT-gate-xp-and-skill-xp-awards-behind-the-per-world-rpg-xp-opt-.md` (In Progress — work in branch `xp-reward-sources`; `RpgMechanic.Xp` has zero production callers on dev)
- [ ] Per-world skills mechanic flag and world-creation opt-in UI — `FEAT-per-world-skills-mechanic-flag-and-world-creation-opt-in-ui.md` (In Progress — work in branch `xp-progression-surface`; no `rpg_skills` on dev)


git issue: 3b5fc7b
