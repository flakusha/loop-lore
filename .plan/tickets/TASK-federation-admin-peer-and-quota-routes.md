<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation admin peer and quota routes

**Status:** Done
**Resolution:** Routes landed under `src/routes/admin/federation/`, mounted at `/api/v1/admin/federation` via `federationAdminRoutes` and wired into the admin route tree. Peers: `GET/POST /peers`, `PATCH/DELETE /peers/:origin`, `PATCH /peers/:origin/workload` for workload-trust and allowed classes. Budgets: `GET/PUT /budgets/:origin/:workloadClass`. Matrix: `GET/PUT /matrix`. Usage: `GET /usage`. Every route gates on the existing `admin.system` permission via `withPermissionAuth`; no `federation.*` permission was invented. Save runs a live probe and stores an unreachable, non-ok or malformed peer as `pending`, never `trusted`. The shared token is write-only: accepted on save, never returned by any route, never logged. Federation-off is honoured on every mutation and surfaced as `enabled: false` on the usage read. `config.federation` and `config.byoKey` are read optionally at mount, so an instance configured without them is the disabled case rather than a mount-time throw. 64 consumer-visible route tests in `src/routes/admin/federation.test.ts` plus 12 guard tests in `src/routes/admin/federation-guards.test.ts`, including a raw-response-text assertion that the token never leaves the server, and an integration test that drives the real `resolvePeerRoute` with the matrix read back from the DB.
**Priority:** high
**Effort:** Large
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-peer-registry-workload-columns, TASK-federation-performance-quota-enforcement, TASK-federation-storage-quota-accounting
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add the admin REST surface the federation panel needs: peer CRUD with
validation and a health probe on save, quota editors, the assignment matrix,
and a usage read.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §5 (routes half). The
Alpine/htmx panel is the next ticket.

Every route is gated with the **existing** permission vocabulary:
`requirePermissionUserId(ctx, "admin.system")` or
`withPermissionAuth(ctx, "admin.system", …)`
(`src/routes/http-utils/auth-narrowing.ts:58`), matching
`src/routes/admin/system-config.ts:113,129`. This epic does **not** add a
`federation.*` permission. Responses declare `{ 200, 403 }` as their siblings
do.

Every configuration mutation writes a `log_entries` row using the same column
set as `src/routes/admin/users.ts:169`.

**Save runs a live health probe.** A peer that cannot answer
`/api/instance-state` is saved as `pending`, never `trusted`, and the operator
is told why. Delete is typed-confirm and revokes the peer's inbound keys and
DEK export grants, matching `revokeDekExportsForPeer`
(`src/federation/dek-rewrap.ts`).

## Acceptance Criteria

**Behaviour**

- `GET /api/admin/federation/peers` lists every peer with display name, kind,
  state, derived link kind, workload trust, allowed classes and storage usage.

- `POST` rejects: a non-`http(s)` origin, a loopback origin without a token, a
  token on a non-loopback origin, a class outside the enum, a duplicate
  origin.

- Saving a peer whose `/api/instance-state` probe fails stores it as `pending`
  and returns the failure reason.

- Quota writes validate non-negative integers and an `advisory | hard` mode;
  the usage endpoint returns in-flight vs limit, rpm used, latency, storage
  used vs soft vs hard, and open reservations.

- The assignment matrix round-trips an ordered preference list per class, and
  an absent row reads back as local-only.

**Tests**

- `src/routes/admin/federation.test.ts` — each validation rejection
  individually; health-probe success and failure on save; permission denial
  (`403`) for a non-admin role; audit row written on every mutation.

**Edge cases**

- An oversized or hostile origin string is rejected by the existing TypeBox
  body schema before any handler logic runs.

- Deleting an unknown peer is a no-op `404`, not a throw.
- A quota of `0` means "block", distinct from unset (unlimited) — the two must
  not collapse.

**Concurrency / TOCTOU**

- A delete racing a save for the same origin resolves to one outcome; the
  revoke of inbound keys and DEK grants is idempotent.

**Security**

- Admin-only: a non-admin role gets `403` on every route.
- A peer's stored token never appears in any response body.
- The usage endpoint exposes peer origins and quota numbers, never user ids,
  chat ids, or prompt content.

**Regressions**

- `src/routes/admin/system-config.test.ts` and the existing admin route tests
  green.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-peer-registry-workload-columns`,
  `TASK-federation-performance-quota-enforcement`,
  `TASK-federation-storage-quota-accounting`.

## Out of Scope

- The Alpine/htmx panel (next ticket).
- A separate federation permission string.

**Context:** The admin REST surface behind the federation panel. Gated with the existing `admin.system` permission — this epic deliberately adds no `federation.*` string. Saving a peer runs a live health probe: an unreachable peer is stored as `pending`, never `trusted`.
**Acceptance Criteria:** Peer CRUD validates each bad origin/token/class/duplicate case individually; a failed probe returns the reason and stores `pending`; a non-admin role gets 403 on every route; every mutation writes a `log_entries` row; a quota of 0 (block) never collapses into unset (unlimited).

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
