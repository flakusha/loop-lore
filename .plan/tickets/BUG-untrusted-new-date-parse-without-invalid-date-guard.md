# BUG: untrusted new Date() parse without Invalid Date guard

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Small
**Epic:** epic-code-quality

## Summary

**Severity**: MINOR

**Sites**:

- `src/age-gate/service.ts:98` — `new Date(parsed)` where `parsed` is user input
- `src/middleware/nsfw-gate/constants.ts:27` — `new Date(birthDate)` (parsed user birthDate)

**Root cause**: `new Date(string)` returns an Invalid Date for unparseable input without throwing. `Invalid Date.getTime()` → `NaN`; downstream code that does arithmetic on `NaN` silently produces wrong results.

**Fix**: wrap with `toDate()` from `src/utils/date.ts` + explicit `Number.isNaN(d.getTime())` guard before use.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed in bugfix-round-7. The age-gate site (`src/age-gate/service.ts`) was already NaN-guarded; the remaining site was NSFW: `calculateAge` in `src/middleware/nsfw-gate/constants.ts` now returns `null` on Invalid Date, and `src/middleware/nsfw-gate/access.ts` denies NSFW with `invalid_birth_date` instead of letting `NaN < minAge === false` allow access. Regression tests in `src/middleware/nsfw-gate/age.test.ts`.
