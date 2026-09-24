<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# BUG: runOffloadPass phase 3 — unlinkSync and DB UPDATE not in same transaction
**Status:** Open
**Severity:** high
**Files:** src/async/offload.ts:124-133

Phase 3 of runOffloadPass performs unlinkSync(file) then UPDATE SET offload_path=null. If the process crashes between, the file is deleted but offload_path still holds the now-invalid path in the DB. Future phase-3 passes skip this row; if the same row is re-spilled to the same ${id}.json.gz path, the stale DB path points to the new file and the next phase-3 deletes it.

Fix: UPDATE SET offload_path=null first, then unlinkSync in a finally inside the same transaction.


git issue: 4ec65e6
