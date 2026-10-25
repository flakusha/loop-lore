<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Mesh reserve issues inbound content keys without authenticating the requester

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — Chose the ticket's first option — HMAC over the reservation body keyed from the meshPsk. New src/federation/mesh-proof.ts: `meshReserveProof` (hex HMAC-SHA256 of a fixed-key-order canonical JSON of {senderOrigin, contentHash, sizeBytes, contentType, ttlMs}, optional fields null-normalized so both sides serialize identically) and `verifyMeshReserveProof` (timing-safe compare). Receiver: /api/mesh-reserve (src/routes/federation-mesh.ts) verifies the body `proof` BEFORE trust/issuance — missing or wrong proof → 401 (also stops trust-state enumeration via 403, and capacity-fill by anonymous callers; malformed bodies still 400). Senders sign: `requestReservation(post, origin, request, { meshPsk })` in src/federation/fan-out.ts (threaded through `fanOutContent` opts and src/federation/outbox.ts `runMeshOutboxPass` opts; wired from config in src/cron/jobs.ts federation.outbox-drain). Tests: src/routes/federation.test.ts — reserve without proof → 401 (repro; before-evidence run 1792913370: with the check disabled both unsigned and wrong-proof reserves returned 200), wrong proof → 401, valid proof → 200, existing reserve/deliver suites updated to sign; A→B transfer (federation-transfer.test.ts) signs and still receives its inbound content key. federation + fan-out + sharing + outbox + clearance suites green (82 tests), gates green (run 941719-mvnieh06).
**Priority:** high
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing
**Tags:** security, federation

**Summary:**

/api/mesh-reserve (src/routes/federation-mesh.ts:45-125) reads config.federation.meshPsk only as an on/off flag (:48-55) and never compares request material against it; senderOrigin is a self-asserted body string (:57-84) gated only by mesh_peers.state === 'trusted' for the claimed origin (src/federation/sharing.ts:88-94). With SMK present and a sealed wire the response hands back the inbound content key minted FOR THE CLAIMED ORIGIN (:92-99, src/federation/peer-keys.ts:54-64) - wireSealed (tls.cert or trustProxy) is a deployment-config assertion, not requester authentication. Anyone who can reach the endpoint can name a trusted origin and obtain that peer's inbound key; after 162f19824 a holder can also produce artifacts/envelopes as that peer, and chained with the no-AAD dek-rewrap defect can install authoritative chat_keys rows. Related: BUG-mesh-deliver-accepts-envelopes-from-untrusted-or-unknown-ori covers the delivery path; this is the issuance path. Reachability: federation.enabled + meshPsk both required (default off). Fix: authenticate the reserve call before key issuance - HMAC over the body keyed from the meshPsk or a per-peer derived key, or client certs.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): Chose the ticket's first option — HMAC over the reservation body keyed from the meshPsk.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 1138d0f (registry tip: e3194b98b Konstantin Fedotov Close issue)
