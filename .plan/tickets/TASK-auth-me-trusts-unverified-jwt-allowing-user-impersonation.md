<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Auth /me trusts unverified JWT allowing user impersonation

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** critical
**Effort:** Medium

## Summary

handleMe falls back to extractUserIdFromJwt (no signature check) when derivedUserId is null. Global derive in elysia-app.ts does not short-circuit on auth failure, so a forged ll_token cookie impersonates any user on GET /api/auth/me. Fix: drop cookie fallback; return 401 when derivedUserId is null. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
