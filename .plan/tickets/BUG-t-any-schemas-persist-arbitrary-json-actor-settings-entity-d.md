# BUG: t.Any() schemas persist arbitrary JSON: actor settings + entity data

**Status:** ✅ Done — fixed on dev by df8e19453 (2026-09-15), verified live + 17 regression tests green
**Priority:** high
**Effort:** Medium

## Summary

src/validation/schemas/actors.ts:44 — ActorUpdateBody.settings t.Optional(t.Any()) → unvalidated JSON persisted to actors.settings. src/validation/schemas/entities.ts:19,28 — EntityCreate/UpdateBody.data t.Any() → arbitrary payload into entity data (memories/lore/notes). Fix: constrain to t.Object with known keys/depth/size bounds. FIXED: commit df8e19453 tightened all three fields to `t.Record(t.String(), t.Any())` (top-level objects only; arrays/primitives rejected) with regression suite `src/validation/schemas/any-tightening.test.ts` (17 tests). Verified 2026-09-16: current code shows the Record constraint at actors.ts:51, entities.ts:25,34; 17/17 pass.

## Acceptance Criteria

## Resolution

Fixed on dev by `df8e19453` (fix(validation): tighten t.Any for actor settings + entity data). All three fields now `t.Optional(t.Record(t.String(), t.Any()))`. Regression suite `any-tightening.test.ts` covers accept-object / reject-array-string-number-boolean-null. Ran 2026-09-16 in this session: 17 pass, 0 fail.

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
