<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Anthropic retry-after test covers missing header but not unparsable header

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:** anthropic retry after test covers missing header but not unp
**Context:** Context: dca8b3483.
**Acceptance Criteria:** add the unparsable-header case.

## Summary

Context: dca8b3483. Severity: nit (test gap). anthropic/http.test.ts:139 title claims 'missing or unparsable' retry-after but only the missing-header case runs; Number('abc')→NaN→undefined path untested (implementation verified correct). Fix: add the unparsable-header case.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
