# BUG: raw JSON.parse outside safe-json — 3 sites

**Status:** ✅ Resolved (no remaining backend sites)
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

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated


## Resolution

Bookkeeping (bugfix-round-7 audit): repo-wide sweep of `src/**/*.ts` non-test sources finds no remaining backend `JSON.parse` outside safe wrappers. The only literal matches are browser-side inline template JS (`src/routes/views/layout.ts` locale bootstrap) and `src/frontend/alpine/json.ts` (client parse of server-rendered JSON with try/catch) — not Node input-parsing targets for `safeJsonParse`. Verified on dev 2026-09-06; ticket was stale.
