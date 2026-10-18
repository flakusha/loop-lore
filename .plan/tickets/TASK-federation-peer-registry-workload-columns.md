<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation peer registry workload columns

**Status:** Done
**Resolution:** Migration `065_mesh_peer_workload_columns.ts` adds `display_name`, `instance_kind`, `auth_mode` (default `tls`), `workload_trust` (default 0), `allowed_workload_classes` (JSON text, default `[]`), `sticky_enabled` (default 0) and `shared_token_enc` to `mesh_peers` — one `ALTER TABLE` per statement; generated files regenerated via `db:sync-types` / `db:sync-manifest`. `src/federation/peer-registry.ts` types the row into `WorkloadPeer` (booleans, parsed class arrays, `hasSharedToken`) and adds `savePeerWorkload`, `listWorkloadPeers`, `setWorkloadTrust`, `setAllowedWorkloadClasses` on top of the existing `coordinator.ts` seams — no second registry. `derivedLinkKind(origin)` is a pure function of the origin host in `src/federation/peer-registry-validation.ts:105` (`127.0.0.1`, `::1`, `localhost`, `*.localhost` -> `loopback`, else `remote`); nothing derived is stored. Tests: `src/federation/peer-registry.test.ts`.
**Priority:** high
**Effort:** Medium
**Epic:** epic-federation-offload-quotas
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Extend the existing `mesh_peers` registry with the workload metadata the
offload/quota epic needs. No second peer table, no parallel discovery path.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §1 specifies the registry.
Today `mesh_peers` carries only `origin`, `state`, `capabilities`, `created_at`
and `capacity_bytes` (`src/db/schema-core.ts:1149-1157`). Nothing distinguishes a
peer that can run workloads from one that only receives replicated content, and
nothing records whether a peer is on this host or across the network.

The registry API already exists: `upsertPeer` / `setPeerState` / `listPeers` /
`touchPeer` (`src/federation/coordinator.ts:49,92,113,133`). This ticket adds
columns and typed accessors over it; it does not add a registry.

- `display_name` (text) — operator label, UI falls back to origin.
- `instance_kind` (text enum) — `business` | `rpg` | `assistant` |
  `dedicated-gpu` | `general`.

- `auth_mode` (text enum) — `tls` | `host-local`.
- `workload_trust` (integer, default `0`) — **default-false** grant to execute
  workloads. Content replication trust never implies it.

- `allowed_workload_classes` (text JSON, default `[]`).
- `sticky_enabled` (integer, default `0`) — whether chat sessions may pin here.

`link_kind` is **derived, never stored**: a pure function of `origin` host
(`127.0.0.1` / `::1` / `localhost` / `*.localhost` → loopback, else remote), so
it cannot drift from the URL.

Schema path is the standard append-only migration
(`src/db/migrations/README.md`), then `bun run db:sync-types` and
`bun run db:sync-manifest` — `src/db/schema*.ts`, `schema-manifest.ts`,
`src/validation/db-schemas.ts` and `src/test-utils/insert-helpers.ts` are
generated, never hand-edited.

## Acceptance Criteria

**Behaviour**

- A peer row created with defaults reads back with `workload_trust = 0`,
  `sticky_enabled = 0`, `auth_mode = "tls"`, `allowed_workload_classes = []`.

- `derivedLinkKind("http://127.0.0.1:3000")`, `("http://localhost:3000")` and
  `("http://[::1]:3000")` return `loopback`; `("https://peer.example")` returns
  `remote`.

- `setWorkloadTrust(db, origin, true)` makes the peer eligible for workload
  selection and the change is readable via `listPeers`.

**Tests**

- `src/federation/peer-registry.test.ts` — defaults on insert, link-kind
  derivation (all four host forms plus a non-loopback case), workload-trust
  round-trip.

- `src/db/migrations.test.ts` and `src/db/migration-roundtrip.test.ts` stay
  green for the new migration.

**Edge cases**

- `derivedLinkKind` returns `null` for a non-`http(s)` URL rather than throwing.
- Setting workload trust on an unknown origin is rejected, not silently upserted.
- An empty and a malformed `allowed_workload_classes` JSON both read back as
  `[]` with a logged warning, never as a crash.

**Concurrency / TOCTOU**

- Two concurrent `setWorkloadTrust` calls for the same origin converge on one
  value (single UPDATE with a WHERE on origin); no read-modify-write of the
  whole row.

**Security**

- `workload_trust` defaults to `0`; a peer trusted for content replication with
  the column untouched is NOT workload-eligible.

- No secret is written by this ticket — the token column arrives with
  `TASK-federation-same-host-loopback-peer-auth`.

**Regressions**

- `src/federation/coordinator.test.ts` and `src/routes/federation.test.ts`
  unchanged and green.

**Repo gates**

- `bun run check` green; new module line coverage at or above the floor.

**Context:** Extend `mesh_peers` with display name, instance kind, auth mode, workload trust, allowed workload classes and a sticky flag; derive loopback-vs-remote from the origin host. Depends on nothing — first slice of the epic.
**Acceptance Criteria:** Defaults land on insert; loopback/remote derivation covers all four host forms; workload trust round-trips through the registry API; the standard append-only migration runs and its roundtrip test stays green.

Implementation complete; tests passing; documentation updated.

## Dependencies

None — this is the first slice of
`.plan/epics/epic-federation-offload-quotas.md`; everything else in the epic
reads the columns it adds.

## Out of Scope

- Peer auth tokens (`TASK-federation-same-host-loopback-peer-auth`).
- Capability advertisement on the wire
  (`TASK-federation-peer-capability-advertisement`).
- Health and load state (`TASK-federation-peer-health-and-load-registry`).

git issue: 1d80416
