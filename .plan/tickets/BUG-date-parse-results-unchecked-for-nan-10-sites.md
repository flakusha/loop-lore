# BUG: Date.parse results unchecked for NaN — 10 sites

**Status:** ✅ Done
**Priority:** low
**Effort:** Small
**Epic:** epic-i18n

## Summary

**Severity**: NIT

**Scope**: 10 sites call `Date.parse()` (or `Date(...)` with one string arg) without checking for `NaN` before use.

**Root cause**: `Date.parse()` returns `NaN` for invalid input. `NaN` propagates silently into downstream arithmetic, comparison, and formatting.

**Fix**: route through `toDate()` from `src/utils/date.ts` — returns a Date object (invalid Date for bad input), then guard with `Number.isNaN(d.getTime())`. Alternatively, use `serializeDate` for unix output.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: captcha/aux-telemetry/age-gate guards + date-gaps.test.ts 19/19.
