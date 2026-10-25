<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: mesh-deliver accepts envelopes from untrusted or unknown origins without a peer-trust check

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — mesh deliver now requires a string reservationId (src/routes/federation-mesh.ts:194-200, 400 otherwise), authorizes the claimed origin via `authorizeMeshPeer` → `assertTrustedPeer` (mesh_peers.state='trusted') at :204/:44-67, and decrypts fail-closed (:213-235).
**Priority:** high
**Effort:** Medium
**Epic:** epic-federation-offload-quotas
**Tags:** security, federation

**Summary:**

src/routes/federation-mesh.ts:120-187 (/api/mesh-deliver) authenticates only by ability to decrypt the envelope. It never consults mesh_peers, so the trusted-peer gate that protects /api/mesh-reserve (src/federation/sharing.ts:92, peer.state must be 'trusted') is absent on the delivery path.

Sender origin is self-asserted: it is read from the request body envelope.origin (src/routes/federation-mesh.ts:153) and passed straight into ciphersForSender (src/federation/peer-keys.ts:218), whose own doc comment says 'Envelope origin (self-asserted; must be trusted)' at src/federation/peer-keys.ts:213 -- the trust requirement is documented but never enforced. receiveDelivery (src/federation/delivery.ts:34) writes mesh_deliveries with no trust lookup.

Impact, in order of severity:
1. Any holder of the mesh PSK can push an envelope claiming ANY origin. Because ciphersForSender falls back to the shared PSK when no per-peer inbound key exists (src/federation/peer-keys.ts:224-226), knowledge of one PSK is enough to impersonate every configured peer.
2. reservationId is optional (src/routes/federation-mesh.ts:148-150), so delivery does not require a prior reservation -- the one control that does enforce trust can be bypassed entirely.
3. No rate limit on either mesh endpoint (no rateLimit reference in src/routes/federation-mesh.ts), and both are mounted in the public, non-auth-blocking section (src/app/register-plugins.ts:137), so an attacker can fill mesh_deliveries and mesh_reservations.

Reachability: requires config.federation.enabled AND config.federation.meshPsk set. Both default to off (src/config/schema-class/federation.ts:8,11), so an unconfigured instance is not exposed -- the routes 503 on unset PSK rather than allowing (src/routes/federation-mesh.ts:49-55,124-130). The exposure is limited to deployments that deliberately enable mesh.

Fix: verify mesh_peers.state === 'trusted' for envelope.origin before accept, on the same code path createInboundReservation already uses; require a reservationId; and gate both endpoints behind the shared rate limiter. Add tests for untrusted-origin rejection and reservation-required rejection.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): mesh deliver now requires a string reservationId (src/routes/federation-mesh.ts:194-200, 400 otherwise), authorizes the claimed origin via `authorizeMeshPeer` → `assertTrustedPeer` (mesh_peers.state='trusted') at :204/:44-67, and decrypts fail-closed (:213-235).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 4b503b5 (registry tip: 75c193286 Konstantin Fedotov Close issue)
