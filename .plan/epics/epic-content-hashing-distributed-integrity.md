<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Content Hashing & Distributed Integrity

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Large
**Type:** Feature Epic

## Summary

End-to-end content-integrity layer that ties frontend-issued request ids,
backend-captured responses, and DB-stored rows together through a single
canonical **record hash** (SHA-256 over a deterministic row envelope),
backed by a **content-versioning registry** (`data_version` + tracked
columns), enforced at every mutation point, and verified by a
**revalidation + healing** daemon plus an **integrity-aware backup**
pipeline that survives restores.

## Motivation

Today the three identifier layers do not reconcile:

| Layer | Identifier | Reliability |
| --- | --- | --- |
| HTTP | `X-Request-Id` (server-generated) | Stable within a process; lost on restart |
| Async store | `request_results.id` (UUID PK) | Durable; survives restart |
| Domain tables | `messages.idempotency_key`, `assets.content_hash` | Partial: `idempotency_key` is advisory only (`BUG-chat-idempotency-not-enforced`); `assets.content_hash` is half-implemented (migration `016_asset_encryption.ts` drops the column in `down()`) |

Without a unified hash:

- **Concurrent identical uploads** create duplicate rows and orphan files
  (`TASK-asset-dedup-toctou-creates-duplicate-rows-and-orphan-files`).
- **Server-side mutations** (offload daemon, manual admin fixes,
  federation sync) silently drift from client-observed state.
- **Restores from backup** cannot prove the schema and a sample of rows
  match the pre-backup state.
- **Cross-layer reconciliation** (`epic-cross-layer-reconciliation.md`)
  has no row-integrity anchor to compare against.

## Scope

1. **Canonical record hash** — SHA-256 over `(table | pk | hash_inputs)`
   envelope. `record_hash` lives on every content-bearing row. The
   frontend does not compute it; the server is authoritative. The hash
   is exposed to clients via `X-Record-Hash` (Q1 scope decision pending).
2. **Content versioning registry** — `data_version` integer + tracked
   column projection per `(table, version)`. Migrations that add a
   tracked column bump the version; a batch runner refreshes hashes.
3. **Browser-side reconciliation** — non-mandatory `localStorage` cache
   of (request id → last-known `record_hash` + response body), with
   drift detection on reload. Cookies are out of scope (CSRF + 4KB cap).
4. **Content validation hook** — `assertContentHash` /
   `validateContentRow` callable from any service-layer writer; throws
   `ContentHashMismatchError` on drift.
5. **Asset dedup enforcement** — `UNIQUE (owner_id, content_hash)`
   closes the TOCTOU window in `src/assets/service/create.ts:21-60`.
6. **Revalidation + healing daemon** — independent scheduler that
   sweeps every content-bearing table, reports drift, and either
   repairs from a known-good source or quarantines the row (state
   carrier: `quarantined_at` + `quarantine_log` table — Q2 scope
   decision pending).
7. **Integrity-aware backups** — extend the existing SQLite + GPG
   pipeline (`TASK-BKP-001..004`) with an application-level manifest
   (per-table index digests + sample verification) and capture of the
   offload spill directory so async results survive a restore.

## Out of Scope

- **Multi-instance reconciliation** — separate epic
  (`epic-multi-instance-reconciliation.md`).
- **Federation healing** — separate epic
  (`epic-federation-swarm-sync.md`).
- **Application-level encryption of offload spills** — coordinate with
  `src/crypto/` in a separate ticket; the body of an async response may
  carry user content.
- **Backfill of `data_version` + `record_hash` for existing rows** —
  separate ticket (large blast radius; needs a per-table migration
  plan).
- **Postgres-side checksum triggers** — SQLite portable code is the
  priority; follow-up once SQLite is stable.

## Sub-Tickets

- [ ] TASK-middleware-fe-be-db-record-content-hashing.md
- [ ] TASK-middleware-browser-side-storage-request-hash-reconciliation.md
- [ ] TASK-middleware-migration-compaction-data-version-hash.md
- [ ] TASK-middleware-content-assets-gallery-hashing-validation.md
- [ ] TASK-middleware-distributed-healing-revalidation-backups.md

## Files (planned)

- `src/hash/record-hash.ts` — `computeRecordHash` + `RECORD_HASH_VERSION`.
- `src/db/content-version.ts` — registry + batch refresh.
- `src/db/revalidate.ts` — sweep + report.
- `src/db/heal.ts` — single-row + bulk heal.
- `src/content/validate.ts` — `assertContentHash` + error class.
- `src/frontend/request-cache.ts`, `src/frontend/reconcile.ts` — browser
  cache + reconciliation flow.
- `src/db/migrations/0xx_*.ts` — see sub-tickets for the per-ticket
  migration files.

## Related

- `epic-middleware-request-lifecycle.md` — sibling concern; the new
  lifecycle foundation (`request-id`, `idempotency`, `async/store.ts`,
  `routes/requests/status.ts`) provides the substrate this epic
  composes on top of.
- `epic-db-content-versioning.md` — FEA-2026-040..044 (registry +
  batch runner + migration index).
- `epic-database-backup-recovery.md` — `TASK-BKP-001..004`.
- `epic-cross-layer-reconciliation.md` — uses `record_hash` as the
  row-integrity anchor for cross-layer checks.
- `epic-frontend-gallery.md` — gallery grid + batch operations
  consume the validation hook.
- `TASK-asset-dedup-toctou-creates-duplicate-rows-and-orphan-files.md`
  — closed by the UNIQUE `(owner_id, content_hash)` constraint.
- `BUG-chat-idempotency-not-enforced.md` — closed by the global
  idempotency layer + record_hash envelope.

## Open Architectural Questions

- **Q1 — `X-Record-Hash` emission scope.** Always / tracked routes only /
  idempotency replay only? Default: always (see ticket 1).
- **Q2 — Quarantine state carrier.** `quarantined_at` column + log
  table / single `row_state` enum / out-of-band log only? Default:
  `quarantined_at` + log (see ticket 5).
