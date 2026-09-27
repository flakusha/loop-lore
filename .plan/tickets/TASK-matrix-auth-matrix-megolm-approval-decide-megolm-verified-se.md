<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: MATRIX-auth-matrix-megolm-approval: decide Megolm-verified-session requirement for Matrix approval

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-auth-channel-provisioning
**Tags:** matrix-gap, auth
**Context:** Matrix DM OTP-channel decision AC4 (WAC2); verified-session requirement blocks messenger-matrix factor work.

## Summary

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Summary:** matrix-authentication-channels AC4 (WAC2) is open: Matrix DM as OTP channel with number-matching approval needs inbound verification, but whether approval requires a Megolm-verified session (stronger) or accepts unverified (availability) is undecided. Security-sensitive call blocking messenger-matrix factor work.
**Acceptance Criteria:**
- [ ] Decision recorded: verified-session-required vs unverified-accepted for approval semantics
- [ ] Matrix DM binding (MXID as address) + auth_challenge command namespace path documented
- [ ] matrix-authentication-channels.md AC4 row updated with decision and adapter behavior
**Tags:** matrix-gap, auth
**Related:** src/integrations/adapter.ts, src/integrations/adapter.test.ts, src/transport/protocol.unified.ts, .plan/matrix-authentication-channels.md

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
