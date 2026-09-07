<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# RPG Opt-In Systems — Skill Checks, Rolls, Actor Attributes: Plan

Worktree: `rpg-opt-in-systems`. Sources: `epic-rpg-mechanics.md` (hub, 6 sub-epics),
`epic-mechanics-governance.md` (Not Started — per-world opt-in gate),
`epic-rpg-progression.md`, `epic-skills.md` (code+tests+schema done, UNWIRED),
`epic-magic-spell-systems.md`, plus code scout of `src/rpg/`, `src/battle/`,
`src/assistant/commands/`. All gap claims verified against the tree 2026-09-07.

## 1. What exists (confirmed)

- **Engines** (`src/rpg/`): `dice/roll.ts` (crypto RNG, d20+advantage/exploding),
  `stats/` (6 abilities, 18 `SkillName` + `SKILL_ABILITY` map, proficiency 2–6,
  point-buy/4d6), `combat/` (initiative, attack vs AC, saves, action economy),
  `xp/` (curves, ASI), `loot/` (weighted tables), `skills/service/` (per-actor
  Skill rows, novice→grandmaster).
- **Battle layer** (`src/battle/`): richer integration (morale/terrain/weather/
  social/NPC AI) with `makeSkillCheck(skillBonus, dc, modifiers)` in
  `integration-schemas/dice.ts:133` — takes a **raw number**, not an actor.
- **Persistence** (`src/rpg/service/`): per-actor sheets (`character-stats.ts`),
  `dice_roll_history`, xp ledger, `world-gate.ts:27` `checkRpgEnabled`
  (reads `worlds.rpg_enabled`).
- **Chat surface** (`src/assistant/commands/`): `/roll NdS±M`, `/attack`,
  `/heal`, `/battle`, `/stats`, `/quest`; `gm-tool-detection.ts` routes
  natural-language rolls to `roll_dice`.

## 2. Confirmed gaps (all verified, no assumptions)

| # | Gap | Evidence |
|---|---|---|
| G1 | `/roll` uses `Math.random`, not the crypto engine | `src/assistant/commands/dice.ts:82`; `cryptoRandomInt` never imported there |
| G2 | `/roll` never writes `dice_roll_history` | zero `logDiceRoll`/history refs in `dice.ts` |
| G3 | No actor→skill-bonus resolution exists | `SKILL_ABILITY` consumed only inside `src/rpg/stats/`; `resolveSkillBonus`/`actorSkillCheck`: zero hits repo-wide |
| G4 | Chat RPG commands bypass the opt-in gate | zero `rpg_enabled`/`checkRpgEnabled` refs in `src/assistant/`; gate used only by `src/routes/rpg/stats-actor.ts` |
| G5 | Opt-in is one boolean, no per-mechanic switches | `epic-mechanics-governance.md` Not Started; only `worlds.rpg_enabled` (migration `003_worlds.ts`) |

## 3. Task split (5 tickets, ordered)

1. **TASK-rpg-unify-dice-rng** (G1+G2): route `/roll` through
   `src/rpg/dice/roll.ts`, log every roll to `dice_roll_history`, keep output
   format. Small, no schema change.
2. **TASK-rpg-actor-skill-checks** (G3): new `resolveActorSkillCheck(actorId,
   skill, dc)` in `src/rpg/` — sheet lookup → `SKILL_ABILITY` → ability mod +
   proficiency (level from sheet) + conditions → delegate to battle
   `makeSkillCheck`. Pure function + tests; callers migrate later.
3. **TASK-rpg-check-command** (builds on #2): `/check <skill> [dc]` chat command
   + `gm-tool-detection` intent, output shows `d20 + mod (source breakdown) vs
   DC → success/margin`, logged to history.
4. **TASK-rpg-gate-chat-commands** (G4): `checkRpgEnabled` in assistant RPG
   commands (`/roll`, `/attack`, `/battle`, `/check`, …); disabled world →
   clean "RPG not enabled" reply, no roll. Must land with #1–#3 or behavior
   changes silently.
5. **TASK-rpg-per-mechanic-opt-in** (G5): implement the governance epic's
   `WorldMechanicsConfig` schema slice — append-only migration adding
   per-mechanic flags defaulting to current `rpg_enabled` value (parity!),
   read path `getMechanicsConfig(worldId)`, wire `dice`/`checks` flags into
   #4's gate. Full Admin/GM UI stays in the governance epic.

Order: #1 → #2 → #3+#4 together → #5. #5 may alternatively land first as pure
schema; the gate wiring (#4) then reads it instead of the boolean.

## 4. Non-goals (stay in their epics)

Skill trees/progression UI (`epic-skills.md`, `epic-rpg-progression.md`),
spellcasting/battle-side rolls (`epic-magic-spell-systems.md`), Admin/GM config
UI (`epic-mechanics-governance.md`), inventory/trading (`epic-trading-inventory.md`).
