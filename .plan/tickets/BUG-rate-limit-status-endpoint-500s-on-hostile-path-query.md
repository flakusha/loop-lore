<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Rate-limit status endpoint 500s on hostile ?path= query

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:** rate limit status endpoint 500s on hostile path query
**Context:** Context: v1 governance surface landed this week (routes/v1/governance.ts:89).
**Acceptance Criteria:** try/catch around the URL construction and fall back to url.pathname, or reject non-relative path values.

## Summary

Context: v1 governance surface landed this week (routes/v1/governance.ts:89). Severity: medium. new URL(url.searchParams.get('path') ?? url.pathname, url.origin) throws TypeError on '?path=://' → uncaught → 500 on an authenticated endpoint. Repro: GET /api/v1/rate-limit/status?path=:// with a session. Fix: try/catch around the URL construction and fall back to url.pathname, or reject non-relative path values.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
