# BUG: untrusted new Date() parse without Invalid Date guard

**Status:** ⬜ Not Started
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

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
