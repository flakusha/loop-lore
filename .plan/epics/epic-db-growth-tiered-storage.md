<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Database Growth & File Splitting (Tiered Storage)

**Overview:** (see sections below)

**Status:** 📝 Draft
**Priority:** Medium
**Effort:** Large
**Type:** Architecture Epic
**Tags:** database, sqlite, scaling, archival, backup, tiered-storage
**Related:** epic-db-content-versioning.md, epic-db-cold-storage-high-perf.md, epic-database-backup-recovery.md, scripts/backup-sqlite.ts

## Summary

As the single-file SQLite DB (`loop-lore.db`, WAL mode, `src/db/index.ts`) grows, hot tables (`messages`, `message_search_tokens`, `memory_embeddings`, `assets` metadata) dominate size and slow backups/checkpoints. Strategy is tiered storage, not live sharding: keep one writable hot DB; move cold rows to per-domain archive DB files; snapshot consistently; prune dense tables by policy. No ATTACH-in-hot-path, no multi-Kysely routing, no per-file encryption (bun:sqlite has no cipher extension) — those options were evaluated and rejected; see Design.

## Scope

- Cold message archival: age-threshold move of `messages` + `message_search_tokens` (+ FTS rows) to `archive-messages.db`; date-bounded reads via ATTACH on demand only.
- Asset lifecycle: `archived_at` flag, orphan-file prune, per-user/world quota with oldest-first eviction (files live on disk; DB holds metadata).
- Backup consistency: `VACUUM INTO` snapshots (no WAL dependence), archive-DB inclusion, row-count verification in `validate-backup-restore.ts`.
- Embedding pruning: TTL/retention policy for `memory_embeddings` + `actor_memories` with batch-delete job.
- Telemetry partitions: time-based tables with scheduled DROP when telemetry is enabled (OFF by default, 90-day retention already configured).
- Read replica (last): checkpoint+copy refresh job, app-level read routing for search/history — only after measuring real read/write pressure.

## Non-Goals

- No live sharding / per-domain writable DBs (Kysely multi-instance routing + cross-shard FK gaps rejected — see scout report).
- No ATTACH DATABASE in request hot path (FK-per-connection gaps, per-DB FTS trigger duplication).
- No per-file encryption keys (no bun:sqlite cipher support; GPG-at-backup already covers at-rest).

## Design

```
Research: scout report DbSplittingProbe (2026-09-26) — current wiring (src/db/index.ts, migrate.ts, append-only migrations, scripts/backup-sqlite.ts), 6 options evaluated (ATTACH / domain-sharding / VACUUM-archive / read-replica / per-file-crypto / cross-DB FTS), growth ranking (messages > search_tokens > assets > memory_embeddings > logs/counters > telemetry-bounded).
```

- Phase order: archival → asset lifecycle → backup consistency → embedding pruning → telemetry partitions → read replica. Each phase ships independently; replica last and only on measured need.
- Archive DBs get their own WAL + `PRAGMA foreign_keys = ON` per connection; migrations apply to archive DBs to prevent drift (append-only policy).

## Acceptance Criteria

- [ ] Cold messages queryable after archival; hot DB shrinks; backup time drops.
- [ ] Backups are WAL-independent consistent snapshots incl. archive DBs; validation checks row counts.
- [ ] Embeddings/assets/telemetry bounded by enforced policy (config + scheduled job + test).
- [ ] `bun run check` green; migration roundtrip tests cover archive-DB migrations.

## Dependencies

- None blocking. Builds on `src/db/migrate.ts` append-only migrations and `scripts/backup-sqlite.ts`.


git issue: 29223be
