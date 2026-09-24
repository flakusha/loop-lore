<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Federation defederation admin operations (peer state + block/allow)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-federation-swarm-sync
**Tags:** federation, defederation, admin

## Summary

Add admin-side primitives that allow an operator to federate with a peer (promote pending → trusted) or defederate (trusted → suspended, or hard-delete). Defederation must revoke transport trust, evict the peer from the gossip + coordinator tables, and emit a structured audit log entry. The companion frontend lives in `IDEA-federation-admin-ui-for-follows-blocklists-key-rotation`; this ticket owns the backend state machine and the audit log.

**Implementation spec:** [`docs/spec/federation-defederation-admin.md`](../../docs/spec/federation-defederation-admin.md) — full schema, state machine, endpoints, side-effect contract, test plan.

## Summary

Federation peers today transition only via gossip discovery + the TLS trust map (`TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl`). There is no admin operator action to *defederate* a misbehaving peer — the only available lever is removing it from the config seeds, which is silent and leaves stale rows in `peer_registry`. This ticket adds explicit `federate` / `defederate` admin operations with audit logging.

## Context

- `epic-federation-swarm-sync.md` and `epic-mesh-federation-content-sharing.md` both assume operators can revoke trust at runtime.
- `src/federation/coordinator.ts` already defines `PEER_STATES = ["pending", "trusted", "suspended"]` but no admin endpoint moves a peer between states.
- `IDEA-federation-admin-ui-for-follows-blocklists-key-rotation` names defederation as a frontend gap; the backend state machine is the prerequisite.
- A defederation that only edits the trust map leaks — the gossip table keeps a "trusted" peer until TTL, and outbound activities may still be queued.

## Direction

1. Admin POST `/api/admin/federation/peers/:origin/federate` and `/defederate` (origin canonicalized via `canonicalOrigin`):
   - `federate` promotes `pending` → `trusted`; writes `peer_state_transitions` audit row (actor, origin, from, to, reason, timestamp).
   - `defederate` moves `trusted` → `suspended` (or deletes the row when `?hard=true`); emits a `federation.defederate` structured log event and a webhook to peers the operator chooses.
2. On defederate: evict the peer from the in-memory peer table (force `last_seen` to epoch), mark all outbound delivery queue rows as `dead-letter`, and refuse new gossip from that origin until re-federated.
3. Audit table (`peer_state_transitions`) is append-only; surfaced via `/api/admin/federation/audit?origin=&since=` for the future admin UI.
4. Defederate is idempotent: a second call against an already-suspended peer returns the existing transition row, not an error.
5. Reason is REQUIRED on defederate (free-text string, max 512 chars); stored verbatim in the audit table.

## Acceptance Criteria

- [ ] `federate` and `defederate` admin endpoints route through the existing admin authz guard (`requireRole("admin")`).
- [ ] State transitions land in `peer_state_transitions` with operator identity, reason, and timestamp.
- [ ] Defederate evicts from the in-memory peer table + marks delivery queue dead-letter.
- [ ] Defederate is idempotent.
- [ ] Tests cover the full state-machine cycle, eviction, and audit-log shape.
- [ ] `bun run check` green.

## Dependencies

- `src/federation/coordinator.ts` (`PEER_STATES`, `upsertPeer`) — state carrier.
- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` — trust map edit hook.
- `IDEA-federation-admin-ui-for-follows-blocklists-key-rotation` — consumes the audit log + endpoints.
- `epic-federation-swarm-sync.md` (umbrella epic).

## Out of Scope

- Frontend UI (covered by `IDEA-federation-admin-ui-for-follows-blocklists-key-rotation`).
- Cross-instance fan-out announcements of defederation (follow-up ticket; this ticket only logs locally).
- Bulk defederation by reason/pattern (single-origin only here).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
