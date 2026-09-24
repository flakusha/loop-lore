<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Federation peer audit probe (zero-trust cross-instance verification)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-federation-swarm-sync
**Tags:** federation, audit, zero-trust, peer-verification

## Summary

Add a zero-trust cross-audit capability: when two instances federate, each one probes the other over the federation transport with a signed challenge, and the probe verifies (1) build hash matches an upstream-pinned value, (2) NodeInfo payload is internally consistent, (3) peer trusts are bounded (no transitive trust inheritance), (4) recent peer-state-transition audit log exists. Probe results feed the existing peer table verdict and can auto-defederate on repeated failures. Strictly opt-in per peer; disabled by default.

**Implementation spec:** [`docs/spec/federation-peer-audit-probe.md`](../../docs/spec/federation-peer-audit-probe.md) — threat model, probe protocol, AUM chain, auto-suspend integration, peer-side `/_attest` endpoint, test plan.

## Summary

`TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` secures the transport; `TASK-build-identity-hash-for-tamper-detection-searxng-style-commi` proves what code is running. Neither answers the runtime question: *“is this peer behaving correctly RIGHT NOW?”* — that is, has the peer been compromised mid-session, is it publishing inconsistent state, is it silently downgrading trust for downstream peers, etc. This ticket adds the audit probe that closes the gap.

## Context

- Zero-trust networking posture for federation: never trust, always verify. The existing tickets verify the transport and the build; the audit probe verifies runtime behavior.
- `src/federation/peer-table.ts` already records `state verdict` per peer (trusted / pending / suspended) but the verdict is currently set by static config + gossip TTL.
- `epic-federation-swarm-sync.md` Security Considerations name “authorized fetch, signature verification, and object ownership checks” but no cross-instance health audit.
- `epic-certificate-and-tls-management.md` covers transport cert lifecycle; the audit probe is application-layer.

## Direction

1. New module `src/federation/audit.ts`:
   - `probePeer(origin, opts)` → `PeerAuditReport` (verdict + breakdown).
   - Probe steps (all signed; each side keeps the signed challenge + response for replay):
     a. **Build-hash probe** — fetch peer’s `/.well-known/loop-lore/build-id`; compare to a pinned hash list the operator pre-loads in `config.federation.peerPins` (origin → accepted build hashes). Mismatch = `untrusted_build`.
     b. **NodeInfo consistency probe** — fetch peer’s `/nodeinfo/2.1` and `/api/instance-state`; cross-check protocol list, software name/version, and instance-id. Inconsistency = `inconsistent_identity`.
     c. **Trust-boundedness probe** — fetch the peer’s own peer-table snippet (a new opt-in `/.well-known/loop-lore/peers` endpoint that returns the peer’s trusted-origin list). If the peer trusts origins not in our own `config.federation.seeds`, flag `unbounded_trust` (transitive trust risk).
     d. **Audit-log probe** — fetch `/api/admin/federation/audit?since=…` (defined in the defederation ticket); if no transitions appear for > N days on an active peer, flag `stale_audit`.
2. Scheduled probe job: every 6 hours per trusted peer (configurable). Failed probes three times in a row auto-suspend the peer (`defederate` without admin reason) and emit `federation.audit.auto_suspend` log.
3. Manual probe via admin endpoint `POST /api/admin/federation/peers/:origin/audit` for on-demand verification.
4. Probe results stored in a `peer_audit_runs` table (origin, ran_at, verdict, breakdown JSON, signed-challenge blob) — 30-day rolling retention.
5. All probes are signed with the local instance’s HTTP-signature key (reuse the actor-key infrastructure from `epic-crypto.md`); peers verify the signature before responding.

## Acceptance Criteria

- [ ] `probePeer(origin)` returns a typed `PeerAuditReport` with verdict enum.
- [ ] Scheduled probe job runs per peer; auto-suspend on 3 consecutive failures.
- [ ] Manual admin probe endpoint works end-to-end.
- [ ] Probe challenges/responses are signed and verified both directions.
- [ ] `peer_audit_runs` table retains 30 days of results.
- [ ] All four probe steps (build hash, NodeInfo consistency, trust boundedness, audit log) implemented and unit-tested.
- [ ] Integration test: spin up two instances, configure peer pins, assert one-way trust downgrade is flagged.
- [ ] `bun run check` green.

## Dependencies

- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` (transport).
- `TASK-build-identity-hash-for-tamper-detection-searxng-style-commi` (build hash surface).
- `TASK-federation-defederation-admin-operations-peer-state-block-al` (defederate hook on auto-suspend).
- `epic-crypto.md` (HTTP-signature keys for probe authentication).
- `epic-federation-swarm-sync.md` (umbrella).

## Out of Scope

- Third-party attestation services (Sigstore, transparency log) — separate ticket.
- Cross-instance content auditing (audit-the-Actor, not the instance) — separate ticket.
- Auto-pinning new peers at first handshake (operator must explicitly add hashes to `peerPins`).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
