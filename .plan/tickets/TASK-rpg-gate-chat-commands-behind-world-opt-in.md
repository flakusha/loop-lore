<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: gate chat commands behind world opt-in

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Implemented
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mechanics-governance.md

## Summary

Gap G4 (verified): zero rpg_enabled/checkRpgEnabled refs in src/assistant/; gate used only by src/routes/rpg/stats-actor.ts. Enforce checkRpgEnabled in /roll /attack /battle /check and other RPG commands; disabled world -> clean 'RPG not enabled' reply, no roll, no history write. Land with /check ticket. Plan doc §3.4. Epic: epic-mechanics-governance.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (JSDoc + denial copy; no prose docs affected)

## Verification Notes (2026-09-10)

- Gates: `src/assistant/commands/dice.ts:165,174` (Dice), `src/assistant/commands/attack.ts:39` (Combat), `src/assistant/commands/battle.ts:45` (Combat) via `checkCommandMechanic` — fail-open without db/world context, clean `**RPG not enabled:**` denial with `handled: true` otherwise (no roll, no state write).
- Tests: `src/assistant/commands/rpg-gate.test.ts` (6) + `src/assistant/commands/attack.test.ts` (6, incl. roster-resolution: empty-battle + target-not-found paths covering `attack.ts:60-63,68-72`); 88/88 pass across the worktree batch.
- Gate: `bun run check` green (21/21) on branch `trust-rpg-gating` (re-based review of `fix-trust-rpg-gating`, cherry-picked off current dev).
