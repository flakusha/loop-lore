<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB growth measurement baseline (per-table bytes + row counts)

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, measurement, storage, perf

**Summary:** Ship a re-runnable per-table size + row-count report for the live DB so the tiered-storage epic's growth ranking rests on measurements instead of an unretained scout report.
**Context:** Every growth claim in `epic-db-growth-tiered-storage.md` ("messages is the #1 growth hotspot", "memory_embeddings is the densest storage") cites a scout report (`DbSplittingProbe`, 2026-09-26) that is not in the repo and cannot be re-read. No ticket or script in the tree measures DB size. The four tickets under the epic each assume a ranking that has never been reproduced.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Add a script that reports, for a given `DB_PATH`:

- per-object bytes via `SELECT name, SUM(pgsize) FROM dbstat GROUP BY name ORDER BY bytes DESC`
- per-table row counts for the tables the epic cares about
- `PRAGMA page_count` / `page_size` / `freelist_count` (file bytes vs live bytes -> reclaimable space)

Feasibility is already verified: `dbstat` and `VACUUM INTO` both work on this `bun:sqlite` build. On the current dev database (649 pages, 2.6 MB) `dbstat` returns per-object bytes, `freelist_count` is 0, and `sqlite_schema` is the single largest object at 151 KB - i.e. the dev database holds no user data at all, so a baseline taken from it measures schema, not growth.

## Design Notes

- Read-only open; never mutate the target DB.
- Re-runnable against any `DB_PATH` so an operator can produce a report from their own instance and attach it to a ticket.
- Cheap enough to run ad hoc; no scheduling in this scope.

## Acceptance Criteria

- [ ] Report script added; `bun run` target in `package.json`.
- [ ] Emits per-table bytes, row counts, file-vs-live bytes on a real database with data.
- [ ] `epic-db-growth-tiered-storage.md` growth ranking updated to cite measured output, or the epic's premise falsified and noted.
- [ ] `bun run check` green.

## Related

- `epic-db-growth-tiered-storage.md`, `epic-db-cold-storage-high-perf.md`
- `TASK-cold-message-archival-to-archive-db-file.md`, `TASK-embedding-and-telemetry-retention-policies.md`


git issue: 5682537
