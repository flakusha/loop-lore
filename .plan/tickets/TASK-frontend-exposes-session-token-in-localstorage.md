<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend exposes session token in localStorage

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** critical
**Effort:** Medium

## Summary

src/frontend/alpine/transports/server.ts:35 reads localStorage.session_token and sends it in XHR. With CSP unsafe-inline this is trivially exfiltratable via XSS. Fix: move auth to HttpOnly SameSite cookie; never expose token in JS. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
