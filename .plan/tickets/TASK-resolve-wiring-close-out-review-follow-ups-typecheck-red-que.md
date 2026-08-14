# TASK: Resolve wiring-close-out review follow-ups: typecheck red + quest test gap + gate caveats

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-rpg-wiring-phase3

## Summary

Follow-ups from wiring-close-out review (other agent's live worktree).

1. src/routes/rpg/combat.test.ts:38 + xp-loot.test.ts:80 — json() helper returns res.json() as unknown → 9x + 5x TS18046 committed at db80bec9 ('clear lint gate' claim false). Type the helper.
2. src/generation/auto-gen/story-mode.ts:62 — lint pass rewrote ...(cond ? {k:v} : {}) → ...(cond && {k:v}) → new TS2698 x3 (uncommitted). Revert to ternary.
3. src/rpg/quests/service.test.ts deleted (309 lines) with no replacement — quest-engine has zero tests. Port to QuestEngine API.
4. scripts/check-wiring.ts:130 — import type counts as wiring (false negative); explicit /index suffix unmatched (false positive). Require value-import.
5. eslint.config.mjs:533 unicorn/no-non-function-verb-prefix: off — add project's disable-with-TODO comment for future compliance.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
