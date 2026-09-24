<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Federation admin UI for follows, blocklists, defederation, key rotation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Frontend admin UI that exposes federation follows, per-origin blocklists, defederate/re-federate actions, and actor-key rotation. Backed by the admin endpoints in `TASK-federation-defederation-admin-operations-peer-state-block-al` and the defederation spec at `docs/spec/federation-defederation-admin.md`.
**Context:** No frontend surface manages federation peer state today. Operators must currently edit config seeds or call admin REST endpoints directly. The companion backend ticket owns the state machine; this ticket owns the Alpine.js + htmx UI that consumes it.
**Acceptance Criteria:** Admin sees a federation panel under `/admin/federation` listing every known peer with state, last-seen, trust-store override, and the audit log; can promote/suspend/defederate (with required reason); can rotate actor key and re-publish public-key document; destructive actions require a typed-confirm modal; tests cover panel load, action dispatch, and confirm-modal gating; `bun run check` green.
**Epic:** epic-federation-swarm-sync
**Tags:** federation, frontend, admin-ui, follows, blocklists, defederation, key-rotation
**Related:** TASK-federation-defederation-admin-operations-peer-state-block-al, TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl, TASK-federation-interconnect-peer-config

## Summary

There is no admin UI today for federation peer management. The backend now exposes audit logs + federate/defederate endpoints (`TASK-federation-defederation-admin-operations-peer-state-block-al`); without a frontend the operator must `curl` admin REST routes. This ticket ships the Alpine.js + htmx panel that consumes those endpoints and surfaces follow/blocklist state, actor-key rotation, and the audit log.

**Implementation spec:** [`docs/spec/federation-defederation-admin.md`](../../docs/spec/federation-defederation-admin.md) — section 6 defines the UI surface and modal flow.

## Context

- `epic-federation-swarm-sync.md` and `epic-mesh-federation-content-sharing.md` both require operator runtime controls that don't exist as UI.
- The backend defederation ticket (`TASK-federation-defederation-admin-operations-peer-state-block-al`) provides the `/api/admin/federation/peers/:origin/federate`, `/defederate`, and `/audit` endpoints.
- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` exposes the trust store; the UI must let operators edit the CA bundle / SPKI pin per peer.
- Actor key rotation uses `TASK-crypto-activitypub-key-rotation-is-non-atomic-insert-failure` (BUG pending); the UI needs a "rotate key" button that POSTs to the rotation endpoint and re-publishes the public-key document.
- Existing `/admin` shell already uses Alpine.js + htmx (see `src/views/admin/*`); federation panel slots in under `/admin/federation`.

## Direction

1. **Peer list view** (`/admin/federation`):
   - Table: origin, state (pending/trusted/suspended), last-seen, trust override (CA / SPKI pin summary), activity count.
   - Row click → detail panel with audit log timeline (`/api/admin/federation/audit?origin=`).
   - State filter chips + origin search box; default sort by `last_seen DESC`.
2. **Per-peer actions** (in detail panel):
   - `Federate` button — visible only when state is `pending` or `suspended`. POSTs `/api/admin/federation/peers/:origin/federate`. Idempotent.
   - `Defederate` button — visible only when state is `trusted` or `pending`. Opens typed-confirm modal (operator types the origin string verbatim). POSTs `/defederate` with `reason` (required, ≤512 chars).
   - `Edit trust` — opens sub-panel editing CA bundle + SPKI pins for `config.federation.peers[].trust` via the existing admin config endpoint.
   - `Rotate actor key` — POSTs to the key-rotation endpoint; on success, triggers a re-publish of the public-key actor document (`/api/federation/actor/:handle/key`).
3. **Audit log panel**: append-only timeline of state transitions (actor, origin, from→to, reason, timestamp). Read-only; no editing.
4. **htmx + Alpine**: panel uses htmx for partial reloads (every 30s) and Alpine for the modal + filter chips. No new frontend dependency.
5. **Confirmation modals**: all destructive actions (defederate, hard-delete, key-rotate) require the operator to retype the origin string or the actor handle in a modal. Confirmation never blocks legitimate reads.

## Acceptance Criteria

- [ ] `/admin/federation` panel renders the peer table with state/last-seen/trust columns and filter/search.
- [ ] Federate / Defederate / Edit trust / Rotate key actions wired to the admin REST endpoints from the companion backend ticket.
- [ ] Destructive actions require typed-confirm modal; the modal rejects empty origin/handle strings.
- [ ] Audit log timeline paginates and is read-only.
- [ ] 30s htmx polling refreshes the peer table without full reload.
- [ ] Tests cover: panel loads, action dispatch (mocked fetch), confirm-modal gating, polling cadence.
- [ ] `bun run check` green; new view registered in admin nav.

## Dependencies

- `TASK-federation-defederation-admin-operations-peer-state-block-al` — admin endpoints + audit table.
- `TASK-federation-tls-peer-trust-custom-ca-pinning-and-optional-mtl` — trust-store edit surface.
- `TASK-federation-interconnect-peer-config` — config section shape.
- `TASK-crypto-activitypub-key-rotation-is-non-atomic-insert-failure` (BUG) — must be fixed before the "Rotate actor key" button ships.
- `src/views/admin/*` (existing Alpine + htmx admin shell).
- `src/views/admin/_nav.html` (admin nav — register the new section).

## Out of Scope

- Backend state machine (covered by the defederation ticket).
- Trust-store semantics (covered by the TLS peer-trust ticket).
- ActivityPub inbox moderation UI (separate ticket — `WIRE-federation-inbox-moderation`).
- Cross-instance fan-out announcements of defederation (separate ticket — covered by `TASK-federation-cross-instance-defederation-announce`).
