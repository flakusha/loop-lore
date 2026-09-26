<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: MATRIX-auth-capability-registry-naming: align auth-challenge/auth-approval capability enum with integrations-core registry

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-auth-channel-provisioning
**Tags:** matrix-gap, auth
**Context:** Matrix authentication-channels decision AC3 (WAC1); adapter capability naming must stay aligned with the integrations-core registry shape.

## Summary

**Status:** open
**Priority:** medium
**Effort:** Small
**Summary:** matrix-authentication-channels AC3 (WAC1) is open: adapters must expose sendAuthChallenge via auth-challenge/auth-approval capability flags, but the enum naming must match the integrations-core registry shape when it lands. The seam already exists in code and risks drift.
**Acceptance Criteria:**
- [ ] Capability ids auth-challenge/auth-approval in src/integrations/adapter.ts reconciled against integrations-core registry shape
- [ ] Naming decision recorded in matrix-authentication-channels.md AC3 row (WAC1 resolved)
- [ ] Contract test in src/integrations/adapter.test.ts pins the final names
**Tags:** matrix-gap, auth
**Related:** src/integrations/adapter.ts, src/integrations/adapter.test.ts, src/transport/protocol.unified.ts, .plan/matrix-authentication-channels.md

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
