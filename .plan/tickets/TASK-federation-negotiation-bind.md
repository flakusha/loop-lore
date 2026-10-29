<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: federation-negotiation-bind

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Bind negotiation transitions to peer authentication: each advanceNegotiation call carries proof (x-peer-origin + bearer-token verify reusing verifyPeerWorkloadToken, or mesh-PSK HMAC over negotiationId/nextState/tick) plus pinVerdict==matched precondition when spkiPins configured; log peer.negotiation.failure on mismatch. Owner epic: epic-mesh-federation-content-sharing. Anchors: src/federation/negotiation.ts (DB-local state machine, no crypto); src/federation/peer-work-auth.ts (6 fail-closed layers); src/federation/peer-workload-token.ts + peer-work-client.ts. Refs: https://www.wireguard.com/protocol/ (Noise_IK identity model, adopt direction); https://blog.gitguardian.com/mutual-tls-mtls-authentication (mutual-auth direction). Acceptance: advance without valid proof throws, row untouched; replay across (id,state) fails; pinned peer with mismatched pin cannot advance; unit tests + check green. No WireGuard/in-app VPN. Source: federation-VPN research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
