# TASK: Fix TS2322 Type Error in exporters.test.ts

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Small
**Epic:** epic-continuous-improvement

## Summary

Fix single TypeScript error: `src/characters/exporters.test.ts(54,13): error TS2322: Type 'string' is not assignable to type 'number'.`

## Root Cause

Line 54 in `src/characters/exporters.test.ts` assigns a string value to a field that expects a number. Likely the `id` field in a test fixture — needs to be `id: 1` (number) instead of `id: "lore-1"` (string), or the type definition needs updating.

## Execution Plan

1. Read `src/characters/exporters.test.ts` lines 50-60
2. Check the type definition for the field at line 54
3. Either fix the test value to match the type, or update the type if it should accept strings
4. Verify: `bunx tsc --noEmit` passes

## Acceptance Criteria

- [ ] `bunx tsc --noEmit` exits 0
- [ ] `bun run check` typecheck gate passes
- [ ] Related tests still pass

## Files

- `src/characters/exporters.test.ts`
- `src/characters/exporters.ts` (type definition reference)
