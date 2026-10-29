<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: federation-fail-closed-issuance

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mesh-federation-content-sharing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Thread the wire-sealed signal (direct server TLS or X-Forwarded-Proto=https + trustProxy) into the mesh reserve handler; refuse inbound-key issuance over plaintext (HTTP 426/403 + structured log) instead of PSK fallback; operator override = explicit config flag, never silent. Owner epic: epic-mesh-federation-content-sharing. Anchors: src/federation/peer-keys.ts (PSK-over-plaintext fallback); src/federation/mesh-proof.ts (HMAC-SHA256); src/federation/dek-rewrap.ts (recipient-bound rewrap); src/config/schema/federation.ts; deploy/Caddyfile. Refs: https://www.wireguard.com/protocol/ (PFS/rekey model context); https://blog.openvpn.net/wireguard-vs-openvpn-for-a-multi-user-homelab (key-distribution burden evidence). Acceptance: reserve over http refused with no key material; sealed-wire path unchanged; PSK-fallback tests assert refusal; check green. DEFER: in-app WireGuard. Source: federation-VPN research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
