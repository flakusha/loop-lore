<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: DB recovery via canonical JSONL log replay — research

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Low
**Epic:** epic-database-backup-recovery.md

## Summary

RESEARCH-ONLY ticket. Investigate using the canonical JSONL logs produced by `src/logging/` (per `TASK-unify-logging-output-to-canonical-jsonl`) as a recovery path when `epic-database-backup-recovery` backup/rollback is unavailable.

Research areas:
- Inventory: which `INSERT/UPDATE/DELETE`-class events are written to JSONL? Identify which entity types are fully reconstructible from logs vs which need a base snapshot.
- Sequence: (a) baseline snapshot of select tables; (b) subsequent writes flow through JSONL; (c) restore = baseline + replayed JSONL between `snapshot_at` and `target_at`.
- Conflicts with WAL: SQLite WAL replay already covers the same window — which events does JSONL capture that WAL cannot (cross-process, async queue, side-effects like asset files)?
- Cost: storage overhead of full JSONL vs sampled. Bounded retention window?
- Failure mode: log truncation, replay idempotency, replay ordering across writers.
- Adjacent: read-only filesystem, encryption-at-rest impact on replay, admin-side replay UI.

Deliverables:
1. `docs/research/db-recovery-via-jsonl-log-replay.md` — feasibility + recommendation
2. Ticket list of follow-up implementation tasks (NOT scheduled in this ticket)
3. Decision: viable as primary recovery path (replaces backup)? secondary (parallel backup)? unsound?

Bind to `epic-database-backup-recovery` (Phase 2 candidate). Cite: `TASK-sqlite-backup-research`, `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps`, `TASK-backup-restore-reliability-and-self-healing-for-federated-de`.

## Acceptance Criteria

- [ ] JSONL event inventory completed (which events are captured, which are reconstructible)
- [ ] Comparison vs SQLite WAL replay coverage documented
- [ ] Storage cost / retention analysis completed
- [ ] Decision document `docs/research/db-recovery-via-jsonl-log-replay.md` merged
- [ ] Follow-up implementation tickets drafted (if viable)
- [ ] Documentation updated
