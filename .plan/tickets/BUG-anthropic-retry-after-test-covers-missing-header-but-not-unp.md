<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Anthropic retry-after test covers missing header but not unparsable header

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:** anthropic retry after test covers missing header but not unp
**Context:** Context: dca8b3483.
**Acceptance Criteria:** add the unparsable-header case.

## Summary

Context: dca8b3483. Severity: nit (test gap). anthropic/http.test.ts:139 title claims 'missing or unparsable' retry-after but only the missing-header case runs; Number('abc')→NaN→undefined path untested (implementation verified correct). Fix: add the unparsable-header case.


## Resolution

Split the mis-titled test: the missing-header case is unchanged, and a new `leaves retryAfter unset when the header is unparsable` case covers `"abc"`, `"12s"`, `""` and `"-5"` — each asserting `retryable === true` and `retryAfter === undefined` (Number(...) is NaN; the `retryAfter > 0` ternary drops it).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
