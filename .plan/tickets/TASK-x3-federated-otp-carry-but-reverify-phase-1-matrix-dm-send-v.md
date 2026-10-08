<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: X3: Federated OTP carry-but-reverify phase-1 (Matrix-DM send via auth-challenge flag)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Summary:** OTP/approval payload may ride Matrix DM or mesh transport, but factor verification re-checks on the local server; foreign auth assertions never trusted (shadow-account proof to local session). amr/auth_time claims never leak cross-server. Phase-1: OTP send via the live auth-challenge capability flag (src/integrations/adapter.ts:44, bridge.send plus registry live); Matrix-DM copy waits on the Matrix adapter; no inbound approval parsing yet (retype into web UI).
**Context:** Parents: auth-channels (AC3/AC4/AC7/AC8) x federation-swarm (C5 identity, transports). The carry-but-reverify rule lives in neither implementation. Auth side is greenfield (no src/auth/factors/ dir yet). WAC2 verified-session-for-approval still open. Standalone per 05 rule (auth plus transport but no migration, no versioned contract, single-system slice in registry.ts).
**Acceptance Criteria:** OTP send succeeds via adapter-present channels carrying the auth-challenge flag; verification re-checks locally with no trust in foreign assertions; amr/auth_time never leave the local server; no inbound approval parsing in phase 1; bun run check green.
**Parents:** 03-X3 (federated OTP delivery with local-only verification).
**Related:** src/federation/clearance.ts; TASK-matrix-auth-channel-ac3 and ac4 tickets (capability flag plus Matrix approval prerequisites); no sibling C ticket covers X3 -- filed standalone.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
