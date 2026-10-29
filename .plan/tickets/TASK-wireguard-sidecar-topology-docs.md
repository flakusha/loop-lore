<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: wireguard-sidecar-topology-docs

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-deployment-topologies
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Docs-only page: when to use WireGuard-as-sidecar (peers behind NAT that HTTPS cannot reach); reference topology (wg sidecar per host, pubkeys via existing trusted-keys flow, loop-lore still does TLS+token+sealed envelopes inside the tunnel); explicit non-goal (no in-app WireGuard, no key-distribution protocol in coordinator). Owner epic: epic-deployment-topologies. Anchors: src/federation/peer-fetch.ts (safeFetch + caBundle); src/federation/gossip.ts (pollOnce trust policy); deploy/Caddyfile (Caddy ACME termination). Refs: https://tailscale.com/blog/how-tailscale-works (control-plane pattern); https://docs.netbird.io/about-netbird/how-netbird-works (sidecar mesh pattern). Acceptance: page merged under docs/; states WireGuard is transport-optional and app auth still applies inside tunnel. Source: federation-VPN research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
