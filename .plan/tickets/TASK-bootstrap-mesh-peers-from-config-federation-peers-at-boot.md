<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bootstrap mesh_peers from config.federation.peers at boot

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

upsertPeer (src/federation/coordinator.ts:49) has zero production callers, so mesh_peers is never populated and assertTrustedPeer (src/federation/sharing.ts:67-79) permanently denies every /api/mesh-* request. Wire config.federation.peers (src/config/schema/federation.ts:47) into a boot-time bootstrap that calls upsertPeer for each configured peer, gated on config.federation.enabled. Acceptance: boot with two peers configured yields two mesh_peers rows; assertTrustedPeer accepts a configured origin and still rejects an unlisted one; federation disabled means no rows are written.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
