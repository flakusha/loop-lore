<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Skill Check Dice Animation

**Summary:** (none captured)
**Context:** Skill-check/dice-roll slice shipped (2026-11-05).
- **Shipped:** `src/frontend/battle/skill-check-display.ts` (roll chip: dice face, roll math, success/failure outcome, critical marker), `src/frontend/battle/skill-check.ts` (`animateDiceRoll` — CSS tumble, lands on the final value under reduced motion or with no dice element), `src/frontend/battle/battle-log.ts` (chip rendered on the log line; the tumble fires once per new roll, guarded per battle id so a re-render never replays it and a new battle never inherits it), `src/frontend/alpine/chat-actions/battle.ts` (payload validation for the new `roll` field), `src/public/css/vn.css` (dice/roll chip styles, `prefers-reduced-motion` fallback, small-width rule), and the locale keys `battle.rollResult` / `battle.rollSuccess` / `battle.rollFailure` so the chip labels resolve through the repo's i18n catalog.
- **Server side:** `src/assistant/commands/battle-utils.ts` — `serializeBattle` now projects the PERSISTED attack roll (`CombatAction.attack.roll`: `rawTotal` = natural d20, `modifier`, `total`) plus the target's armor class as the DC into the lean `roll` payload field. The raw dice never leave the battle log.
- **Backend verdict, not a client-side guess:** the projected `roll` also carries the backend's own `hit` and `criticalMiss` flags (`CombatAction.attack.hit` / `.criticalMiss`). The chip shows that verdict, because the backend counts a natural 20 as a hit and a natural 1 as a miss regardless of the total — a client-side `total >= dc` comparison showed "failure" for a natural 20 against a high DC and "success" for a natural-1 whiff. A plain skill check (no verdict delivered) still resolves by comparing the total with the DC.
- **Feeding endpoint:** the panel payload built by `serializeBattle` (battle panel route) → chat actions `battle-started` / `battle-updated` → `renderBattlePanel` → `renderBattleLog`. The roll source is the attack roll persisted with the combat action; the DC is the target's `Combatant.ac` (the same value the attack roll is compared against).
- **Deliberately skipped:** sound effects. The AC is optional and the dice animation is silent. The repo does have an audio GENERATION pipeline (`src/generation/audio/`, `src/generation/audio-gen-route.ts`, `AssetType.Audio` in `src/db/enums-content.ts:29`), but nothing on the playback side for this panel: no audio asset files are committed, no asset dir ships with the frontend, and the only `<audio>` element in the frontend is the gallery preview in `src/frontend/asset-preview.ts:128` — there is no sound-effect playback helper to hook a dice sound into, and the dedicated `<audio-player>` component is still Not Started (`.plan/tickets/TASK-audio-player-component.md:13`). The `/sfx` generation command is an unimplemented stub (`src/assistant/commands/sfx.ts:26`).
- **Tumble guard:** the guard is module-level (the panel re-renders wholesale) but keyed by the battle id, and `renderBattleLog` now REQUIRES that id — no caller can share one bucket across battles.
- **Still open:** target selection (the payload carries no area/self targets), action cost and cooldown display (the payload carries no per-action cost or cooldown), and social skill-check rolls (`src/rpg/service/battles/social.ts` persists only the narration, so no roll reaches the client).
**Acceptance Criteria:** (none captured)


**Status:** Done
**Landed:** 181971f9a attack-roll chip + backend-verdict outcome (battle-log render, CSS dice tumble; sound deliberately skipped — no audio pipeline, optional AC; social rolls stay open on the epic)
**Scope:** epic-battle-ui: skill-check/dice-roll UI (TASK-skill-check)
**Priority:** P0 — Critical
**Effort:** Medium
**Type:** Feature Task
**Tags:** battle, frontend, ui, dice, animation
**Epic:** epic-battle-ui

## Summary

Animated dice roll visualization for skill checks and attacks.

## Core Features

- 3D dice animation
- Roll result display
- Critical hit/fail indicators
- Sound effects (optional)

## Acceptance Criteria

- [x] 3D dice roll animation (`src/public/css/vn.css` dice tumble + `animateDiceRoll` wiring in `src/frontend/battle/skill-check.ts`; verified 2026-11-05)
- [x] Roll result display (natural/modifier/total/DC chip in `src/frontend/battle/skill-check-display.ts`, rendered on the log line in `src/frontend/battle/battle-log.ts`; the success/failure word comes from the backend's delivered hit verdict; verified 2026-11-05)
- [x] Critical hit/fail visual indicators (the entry's existing `critical` flag drives the critical-hit marker and the delivered `criticalMiss` flag drives the critical-fail marker; verified 2026-11-05)
- [ ] Sound effects (optional) — deliberately skipped: the AC is optional and there is no sound-effect playback path in the frontend (no committed audio assets, no playback helper; the `<audio-player>` component is Not Started in `.plan/tickets/TASK-audio-player-component.md`)
- [x] Mobile compatible (the chip has a small-width rule in the `@media (width <= 640px)` block in `src/public/css/vn.css`; verified 2026-11-05)

## Files to Create

- `src/frontend/battle/dice-animation.ts`
- `src/frontend/battle/skill-check-display.ts`

**Resolved:** 2026-11-06 reconcile: attack-roll slice landed on dev (`a07f3ce89` + `181971f9a`, epic note `3d5d11e2f`); social-roll gap stays open on the epic.
