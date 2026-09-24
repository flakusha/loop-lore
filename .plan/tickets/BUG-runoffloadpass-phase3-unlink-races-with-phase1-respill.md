<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# BUG: runOffloadPass phase 3 — unlinkSync races with phase 1 re-spill

**Priority:** Low
**Effort:** Small
**Status:** done
**Severity:** n/a
**Reason:** the described race requires phase 1 (`status = 'complete'`) and phase 3 (`status = 'expired'`) to SELECT the same row simultaneously. Phase 1's WHERE clause (`offload.ts:84-86`: `status = 'complete'`) and phase 3's (`offload.ts:120`: `status = 'expired'`) filter on disjoint status sets — a row cannot be both complete and expired. The deterministic-path re-spill is therefore impossible across these two phases for the same row. The underlying non-atomicity of phase 3 (unlink BEFORE UPDATE) IS a real defect and is captured separately in BUG-runoffloadpass-phase3-unlink-and-db-update-not-atomic. Closing this ticket as a misattribution of the symptom.

The underlying issue (cleanup non-atomicity, crash between unlink and UPDATE) is tracked in BUG-runoffloadpass-phase3-unlink-and-db-update-not-atomic.


git issue: e2b0501

**Summary:** Claimed unlinkSync (phase 3) races with phase 1 re-spill to the same `${id}.json.gz` path.
**Context:** `src/async/offload.ts` phase 1 (status = 'complete') and phase 3 (status = 'expired') select disjoint status sets.
**Acceptance Criteria:** none — REJECTED by strict review (2026-09-24): a row cannot be both complete and expired, so the two phases never touch the same row; the real phase-3 defect is tracked separately in BUG-runoffloadpass-phase3-unlink-and-db-update-not-atomic.
