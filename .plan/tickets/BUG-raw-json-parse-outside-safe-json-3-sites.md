# BUG: raw JSON.parse outside safe-json — 3 sites

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-code-quality

## Summary

**Severity**: NIT

**Sites**:

- `scripts/version-bump.ts:108` — raw `JSON.parse`
- `scripts/version-bump.ts:114` — raw `JSON.parse`
- `routes/views/layout.ts:73` — raw `JSON.parse` (already try-wrapped)

**Root cause**: project has `src/utils/safe-json.ts` (`safeJsonParse`, `jsonParseOr`, `safeJsonStringify`) which should be the canonical parse path. Using raw `JSON.parse` bypasses any future safety hardening.

**Fix**: replace with `safeJsonParse` or `jsonParseOr`. `layout.ts:73` is already try-wrapped — swap to `safeJsonParse` for consistency.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
