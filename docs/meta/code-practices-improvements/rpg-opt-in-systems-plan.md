<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# RPG Opt-In Systems — Skill Checks, Rolls, Actor Attributes: Plan

Worktree: `rpg-opt-in-systems`. Sources: `epic-rpg-mechanics.md` (hub, 6 sub-epics),
`epic-mechanics-governance.md` (Not Started — per-world opt-in gate),
`epic-rpg-progression.md`, `epic-skills.md` (code+tests+schema done, UNWIRED),
`epic-magic-spell-systems.md`, plus code scouts of `src/rpg/`, `src/battle/`,
`src/assistant/`, `src/routes/worlds/`, `src/routes/messages/`. Gap claims verified
2026-09-07 (batch 1) and 2026-09-08 (batches 2–3).

## 1. What exists (confirmed)

- **Engines** (`src/rpg/`): `dice/roll.ts` (crypto RNG, d20+advantage/exploding),
  `stats/` (6 abilities, 18 `SkillName` + `SKILL_ABILITY` map, proficiency 2–6,
  point-buy/4d6), `combat/` (initiative, attack vs AC, saves, action economy,
  combat-local conditions gating stunned/paralyzed), `xp/` (curves, ASI,
  `xpForEnemyDefeat`, `awardXp`), `loot/` (weighted tables), `skills/service/`
  (per-actor Skill rows, novice→grandmaster).
- **Battle layer** (`src/battle/`): richer integration (morale/terrain/weather/
  social/NPC AI) with `makeSkillCheck(skillBonus, dc, modifiers)` in
  `integration-schemas/dice.ts:133` — takes a **raw number**, not an actor.
- **Persistence** (`src/rpg/service/`): per-actor sheets (`character-stats.ts`
  with `create`/`get`/`updateCharacterStats`), `dice_roll_history`, xp ledger,
  `world-gate.ts:27` `checkRpgEnabled` (reads `worlds.rpg_enabled`).
- **Chat surface** (`src/assistant/commands/`): `/roll NdS±M`, `/attack`,
  `/heal`, `/battle`, `/stats`, `/quest`; `gm-tool-detection.ts` routes
  natural-language rolls to `roll_dice`.
- **Worlds** (`src/routes/worlds/`): CRUD + export (`WorldBundle` JSON) +
  import (`src/routes/world-import/`, user-driven only) + timelines +
  `world_lore_entries` CRUD; creation uses ~10 hardcoded defaults
  (`worlds.ts:76-103 handleCreateWorld`). Lore reaches the model only via soft
  keyword prompt injection (`prompt/sections/lore.ts`, `lore-activation.ts`);
  `world-traits` CRUD exists but is **not consumed by prompts**.
- **History**: mutable — PATCH edit, soft-hide, `?hard=true` GDPR delete
  (`routes/messages/update.ts`); only swipes are append-only (`swipe_index`
  unique, `swipe-race-insert.ts`). Post-gen quality seam exists
  (`src/chat/hallucination-guard/`).

## 2. Confirmed gaps (all verified, no assumptions)

| # | Gap | Evidence |
|---|---|---|
| G1 | `/roll` uses `Math.random`, not the crypto engine | `src/assistant/commands/dice.ts:82`; `cryptoRandomInt` never imported there |
| G2 | `/roll` never writes `dice_roll_history` | zero `logDiceRoll`/history refs in `dice.ts` |
| G3 | No actor→skill-bonus resolution exists | `SKILL_ABILITY` consumed only inside `src/rpg/stats/`; `resolveSkillBonus`/`actorSkillCheck`: zero hits repo-wide |
| G4 | Chat RPG commands bypass the opt-in gate | zero `rpg_enabled`/`checkRpgEnabled` refs in `src/assistant/`; gate used only by `src/routes/rpg/stats-actor.ts` |
| G5 | Opt-in is one boolean, no per-mechanic switches | `epic-mechanics-governance.md` Not Started; only `worlds.rpg_enabled` (migration `003_worlds.ts`) |
| G6 | Level-up math is dead code — XP never becomes levels | `hpOnLevelUp`/`grantsAsi`/`asiRemaining` (`xp/levelup.ts`), `canLevelUp`/`levelFromXp`: zero callers outside `src/rpg/xp`; no `applyLevelUp`; nothing persists level/hp/ASI to sheets |
| G7 | No ability checks outside combat | `makeSavingThrow`/`makeAttackRoll` wired only in `routes/battle/resolution.ts`, `routes/rpg/combat.ts`, `service/battles/actions.ts`; no out-of-combat check surface |
| G8 | Sheet conditions never affect rolls; no timed buffs | conditions in two disconnected places (combat-local gating vs sheet JSON never consumed); no stat deltas, no expiry |
| G9 | No ruleset templates; creation uses hardcoded defaults | zero `ruleset` refs in `src/`; `handleCreateWorld` hardcodes ~10 defaults; `WorldBundle` import is user-driven, never applied at creation |
| G10 | Lore/rules are prompt suggestions, never enforced | `lore.ts` injects only; `world-traits` not consumed by prompts; no compliance check on generated output (hallucination-guard is quality-only) |
| G11 | History is mutable — no history-committing mode | PATCH/DELETE/hide exist per-message; no append-only world/chat flag |

## 3. Task split, batch 1 (5 tickets, filed — issues d5506a5, 6629f0d, f26f456, f2b98e3, e98ab7f)

1. **TASK-rpg-unify-dice-rng** (G1+G2): route `/roll` through
   `src/rpg/dice/roll.ts`, log every roll to `dice_roll_history`, keep output
   format. Small, no schema change.
2. **TASK-rpg-actor-skill-checks** (G3): new `resolveActorSkillCheck(actorId,
   skill, dc)` in `src/rpg/` — sheet lookup → `SKILL_ABILITY` → ability mod +
   proficiency (level from sheet) + conditions → delegate to battle
   `makeSkillCheck`. Pure function + tests; callers migrate later.
3. **TASK-rpg-check-command** (builds on #2): `/check <skill> [dc]` chat command
   plus `gm-tool-detection` intent, output shows `d20 + mod (source breakdown) vs
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

## 4. Task split, batch 2 — checks / XP / levels / stats (G6–G8)

1. **TASK-rpg-level-up-flow** (G6): `applyLevelUp(actorId)` — load sheet →
   while `canLevelUp`: level+1, hp += `hpOnLevelUp`, ASI flag when `grantsAsi`
   (levels 4/8/12/16/19, cap 20) → persist via `updateCharacterStats` + ledger
   event. Auto-check at end of `awardXp` + explicit POST `/api/rpg/xp/levelup`
   and `/levelup` command (gated). Tests: multi-level jumps, cap.
   Epic: `epic-rpg-progression.md`.
2. **TASK-rpg-ability-checks** (G7, builds on #2): `resolveAbilityCheck(actorId,
   ability, dc)` reusing the sheet→modifier pipeline without proficiency;
   extend `/check` (`/check str` ability vs `/check athletics` skill) +
   gm-tool-detection. Epic: `epic-rpg-mechanics.md`.
3. **TASK-rpg-timed-conditions** (G8): `addCondition(actorId, {condition,
   statDeltas, expires})` on the sheet; modifier hook consumed by #2/#7
   resolvers and attack rolls (blessed +1d4, poisoned disadvantage — no
   double-disadvantage stacking bug); expiry on combat rounds + wall-clock.
   Scope to the `combat/conditions.ts` list first. Epic: `epic-rpg-progression.md`
   (`StatusEffect` owner per hub split).

## 5. Task split, batch 3 — world ruleset templates + enforcement (G9–G11)

1. **TASK-rpg-ruleset-templates**: `ruleset_templates` table (append-only
   migration) + `worlds.ruleset_id`; built-in seeds (e.g. `d20-gritty`,
   `narrative-freeform`, `lore-strict-canon`) carrying mechanics flags +
   POST `/api/worlds` (`handleCreateWorld`) replacing hardcoded defaults;
   custom user templates CRUD. WorldBundle export includes `ruleset_id`.
   Epic: `epic-mechanics-governance.md` (creation-time enforcement of its config).
2. **TASK-rpg-ruleset-enforcement** (G10, builds on #1): active ruleset injected
    into prompt assembly (hard section, not keyword-gated) + post-generation
    compliance check on the `hallucination-guard` seam for `lore-strict` worlds
    (lore contradiction → regen-with-correction or GM-flag, never silent).
    `world-traits` wired into prompts as part of this (currently stored only).
    Epic: `epic-mechanics-governance.md`.
3. **TASK-rpg-history-committing-chats** (G11, builds on #1): per-world
    `history_mode: mutable | committed`; committed chats reject PATCH content
    edits and soft-hide (403 + reason), canon events append to world timeline
    via existing `promote-lore` path. Constraint: GDPR `?hard=true` delete MUST
    keep working (legal override, logged). Epic: `epic-mechanics-governance.md`.

Order: batch-3 #1 (ruleset templates) after batch-1 #5 (reads its flags); #2
(ruleset enforcement) and #3 (history committing) after #1.

## 6. Non-goals (stay in their epics)

Skill trees/progression UI (`epic-skills.md`, `epic-rpg-progression.md`),
spellcasting/battle-side rolls (`epic-magic-spell-systems.md`), Admin/GM config
UI (`epic-mechanics-governance.md`), inventory/trading (`epic-trading-inventory.md`).
