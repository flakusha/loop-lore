# TASK: Fix ESLint Errors — 73 errors across 16 files

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-continuous-improvement

## Summary

Fix all 73 ESLint errors to achieve `bun run lint` passing with 0 errors. Run `eslint . --fix` first for auto-fixable issues (43 errors + 7 warnings), then manually fix the remainder.

## Current State

- 73 errors, 839 warnings
- 43 errors auto-fixable with `--fix`
- 0 errors in tests/ or scripts/ — all 73 are in src/ or .agents/

## Execution Plan

### Phase 1: Auto-fix (43 errors)

```bash
bun run lint:fix
```

Covers: switch-case-braces, no-inferrable-types, no-unnecessary-type-assertion, array-type, prefer-optional-chain, numeric-separators-style

### Phase 2: SKILL.md broken code block (11 errors)

File: `.agents/skills/sync-tickets/SKILL.md`

- 7x `no-undef` — variables referenced in code block that don't exist
- 2x `unicorn/no-unused-array-method-return`
- 1x `unicorn/filename-case`
- 1x `unicorn/explicit-length-check`
- Fix: Repair or remove the broken code block in the markdown file

### Phase 3: src/config/load.ts (12 errors)

- `unicorn/number-literal-case` (2) — fix hex/number literal casing
- `unicorn/numeric-separators-style` (2) — add proper separators
- Remaining: type-conversion, inferrable-types, template-expressions

### Phase 4: src/characters/validator.ts (10 errors)

- `@typescript-eslint/no-unnecessary-type-assertion` (3) — remove redundant `as`
- `unicorn/no-for-loop` (3) — convert to for-of
- `unicorn/prefer-set-has` (1) — convert array to Set
- `@typescript-eslint/prefer-optional-chain` (1)
- `unicorn/consistent-conditional-object-spread` (1)
- `unicorn/explicit-length-check` (1)

### Phase 5: src/routes/export-sse.ts (7 errors)

- `unicorn/max-nested-calls` (4) — extract nested calls
- `@typescript-eslint/array-type` (2) — Array<T> → T[]
- `@typescript-eslint/restrict-template-expressions` (1)

### Phase 6: Remaining files (32 errors)

- src/rpg/npc-navigation/service.ts (6): prefer-group-by, nested-assignment
- src/routes/views.ts (5): nested-ternary, prefer-optional-chain
- src/routes/model-comparisons.ts (5): type-conversion, template-expressions
- src/rpg/blog/service.ts (4): nested-assignment, switch-case-braces
- src/crypto/key-rotation.ts (4): type-conversion, switch-case-braces
- src/rpg/quests/service.ts (3): switch-case-braces, no-lonely-if
- src/routes/model-comparisons.test.ts (3): number-literal-case, prefer-https
- src/rpg/achievements/service.ts (2): switch-case-braces
- src/config/generate-domain-schemas.ts (2): prefer-group-by
- src/assistant/prompt/sections/character-traits.ts (2): inferrable-types
- src/rpg/integration-registry.ts (1): no-lonely-if
- src/config/hot-reload.ts (1): no-lonely-if

## Acceptance Criteria

- [ ] `bun run lint` exits 0 with 0 errors
- [ ] `bun run check` lint gate passes
- [ ] No new warnings introduced
- [ ] All existing tests still pass

## Files to Modify

- `.agents/skills/sync-tickets/SKILL.md`
- `src/config/load.ts`
- `src/characters/validator.ts`
- `src/routes/export-sse.ts`
- `src/rpg/npc-navigation/service.ts`
- `src/routes/views.ts`
- `src/routes/model-comparisons.ts`
- `src/rpg/blog/service.ts`
- `src/crypto/key-rotation.ts`
- `src/rpg/quests/service.ts`
- `src/routes/model-comparisons.test.ts`
- `src/rpg/achievements/service.ts`
- `src/config/generate-domain-schemas.ts`
- `src/assistant/prompt/sections/character-traits.ts`
- `src/rpg/integration-registry.ts`
- `src/config/hot-reload.ts`

## Related

- `epic-code-quality.md` — ongoing ESLint quality epic
- `TASK-epic-36-lint-fix-array-method-warnings.md` — related array method lint task
