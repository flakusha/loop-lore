<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Logout deletes session without signature or ownership check

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium

## Summary

src/routes/auth/session.ts:18-21 — logout deletes session by sid extracted from JWT WITHOUT signature verification or session.user_id ownership match; forged/guessed sid enables logout-CSRF and deletion of other users' sessions. Fix: verify signature + match session.user_id to authenticated ctx.userId before delete. Related MAJOR same file :41 — /me falls back to unsigned extractUserIdFromJwt (no signature/expiry check), user spoofing possible when derive did not populate userId; use only verified context.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
