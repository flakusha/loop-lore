<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# BUG: runOffloadPass phase 1 — spill() and DB UPDATE not in same transaction
**Status:** Open
**Severity:** high
**Files:** src/async/offload.ts:91-101

Phase 1 of runOffloadPass performs two non-atomic steps: `await spill(row.id, row.response_body)` writes ${id}.json.gz, then `await database.updateTable(...).set({offloaded_at, offload_path, response_body: null}).execute()`. If the process crashes between, the spill file is orphaned on disk but offload_path stays null. Next pass re-selects same row, spills to same deterministic path, overwriting the orphan.

Fix: wrap spill + UPDATE in a single Kysely transaction; on rollback unlink the spilled file.


git issue: 91f85bc
