<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation storage quota accounting

**Status:** Done
**Resolution:** Migration `066_instance_storage_budgets` adds per-instance soft/hard byte limits (optionally per asset class) plus an opt-in eviction policy. `src/federation/storage-usage.ts` reads usage as `SUM(assets.size_bytes)` + open `mesh_reservations` holds with no disk walk; `storage-quota.ts` warns on soft, refuses the write at `createAsset` and at the image-generation route BEFORE the provider call (`federation.quota_exceeded`, asserted by a provider spy recording zero invocations); `storage-eviction.ts` is archive-first, oldest-first, audit-logged and never touches an asset a live chat message references; `storage-reconcile.ts` runs on the existing cron seam as `federation.storage-reconcile`, reports each drift direction and never adopts an orphan or re-creates a vanished file. Federation stays off by default: with no budget row every gate returns after one query.
**Priority:** high
**Effort:** Large
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-peer-registry-workload-columns
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Budget the bytes this instance stores for generated assets, reconcile the
budget against disk, and evict only when told to.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §4.

**The DB is the source of truth.** `assets.size_bytes` is `NOT NULL`
(`src/db/schema-content.ts:43`) and `storage_path` locates the file, so the
authoritative figure is `SUM(assets.size_bytes)` plus open `mesh_reservations`
holds (`src/federation/sharing.ts:47`). Disk is what gets reconciled
*against* — a walk is not a ledger.

Layers: the existing per-peer inbound ceiling (`mesh_peers.capacity_bytes`,
enforced by the reservation path) is unchanged; a new
`instance_storage_budgets` row carries a per-instance soft and hard byte
limit, optionally per asset class.

Soft: report and warn, writes continue. Hard: a write whose post-write total
would exceed the budget is refused at the asset-write seam **and** generation
that would produce the asset is refused before the provider call — paying for
an image you cannot store is the failure worth preventing.

Reconciliation runs on the existing cron seam (the mechanism
`federation.outbox-drain` uses) and compares the DB sum to a bounded walk of
`config.assets.uploadDir`:

| Drift | Action |
| --- | --- |
| DB > disk | lower the count to match, log the vanished rows, never re-create files |
| DB < disk | log the orphans, **never adopt them** — an untracked file has no owner, no chat link and no hash |
| directory gone | usage reads zero, writes fail with a clear storage error, the discrepancy is reported loudly rather than silently resetting the budget |

Eviction is opt-in, archive-first, oldest-first, audit-logged, and never
touches an asset referenced by a live chat message. When nothing is evictable
the write is refused; the budget is never exceeded to make room.

## Acceptance Criteria

**Behaviour**

- Usage equals `SUM(assets.size_bytes)` plus open reservations, and is
  readable without walking the disk.

- Crossing the soft limit reports and continues; crossing the hard limit
  refuses the write with `error_code` `federation.quota_exceeded`.

- A generation whose output cannot fit the remaining hard budget is refused
  **before** the provider call — asserted by a provider spy that records zero
  invocations.

- An eviction sweep removes only archived-then-unreferenced assets, oldest
  first, writing one audit row per eviction.

**Tests**

- `src/federation/storage-quota.test.ts` against a temp `uploadDir`: soft
  warn, hard refuse, eviction ordering, refusal when nothing is evictable.

- `src/federation/storage-reconcile.test.ts` — each drift direction built
  deliberately on disk, then reconciled; orphan files are reported and not
  adopted.

**Edge cases**

- A missing upload directory reports the discrepancy; it does not reset a
  configured budget to zero.

- A zero-byte asset counts as zero and never triggers eviction pressure.
- Reconciling twice in a row is idempotent and produces no second audit row.

**Concurrency / TOCTOU**

- The usage read and the budget check are not atomic across a concurrent
  write; the check is made against a value re-read inside the same write
  transaction so two concurrent writes cannot both see room that only one of
  them has.

**Security**

- A hard-limit rejection reveals only the quota state, never another user's
  asset names or paths.

- A peer-received asset is stored through the same asset pipeline as a local
  one — same `storage_path` layout, same `content_hash`, same encryption tier
  — so an existing DB snapshot plus the asset directory stays a complete
  restore and no second backup path is created.

**Regressions**

- `src/assets/service/file-system.test.ts` and the reservation tests in
  `src/federation/sharing.test.ts` green.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-peer-registry-workload-columns` (migration numbering
  continuity).

## Out of Scope

- Cross-peer restore.
- Free-space probing of the host filesystem (`statfs`); the budget is about
  loop-lore's own accounting, not the disk vendor's.

**Context:** Bytes this instance stores for generated assets. The DB is the source of truth (`assets.size_bytes` is NOT NULL); disk is reconciled against. A hard limit also refuses the generation before the provider call, because paying for an image you cannot store is the failure worth preventing.
**Acceptance Criteria:** Soft warns and continues, hard refuses the write with a namespaced error code; an over-budget generation is refused with zero provider invocations; eviction is archive-first, oldest-first and audit-logged, never touching a referenced asset; reconciliation is idempotent and never adopts orphan files.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
