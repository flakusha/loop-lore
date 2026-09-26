<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: MATRIX-auth-per-role-factor-policy-shape: decide per-role minimum factor count policy storage

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-auth-channel-provisioning
**Tags:** matrix-gap, auth
**Context:** Enforcement policy storage decision AC12 (WAC4); static config vs DB policy table for per-role minimum factor counts.

## Summary

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** matrix-authentication-channels AC12 (WAC4) is open: enforcement policy storage splits instance defaults (config.toml [auth] TypeBox schema) vs per-user state (auth_factors), but the per-role minimum count policy shape (static config vs DB policy table) is undecided. Blocks admin-gate enforcement work.
**Acceptance Criteria:**
- [ ] Decision recorded: static config vs DB policy table for per-role minimum factor counts
- [ ] Instance-default vs per-user/per-role override ownership documented
- [ ] matrix-authentication-channels.md AC12 row updated with chosen shape
**Tags:** matrix-gap, auth
**Related:** src/validation/schemas/chat.ts, src/db/schema-manifest.ts, src/integrations/adapter.ts, .plan/matrix-authentication-channels.md

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
