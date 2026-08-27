<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Separate database for logging — research

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Epic:** `epic-logging-telemetry.md` (logging), `epic-database-backup-recovery.md` (storage), `epic-multi-instance-reconciliation.md` (consistency)
**Issue:** TBD
**Related:**
- `src/logger/` — DB transport writes to `log_entries` in the **main app DB**
- `src/db/migrations/005_utility_tables.ts` — `log_entries` + `telemetry_events` tables
- `src/db/migrations/067_request_results.ts` — async result store (sibling concern)
- `src/async/store.ts` + `src/async/offload.ts` — async result spill (worktree `feat-middleware-request-lifecycle`)
- `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps.md` — checksums + JSONL dumps (downstream of any DB choice)
- `TASK-sqlite-backup-research.md` — sibling research: SQLite backup strategy
- `TASK-disaster-recovery-research.md` — sibling research: disaster recovery
- `epic-logging-telemetry.md` — trace/fatal + canonical JSONL (recently merged)
- `TASK-unify-logging-output-to-canonical-jsonl.md` — done; JSONL file transport now exists
- `TASK-logger-censor-bypasses-message-field-pii-secret-leak.md` — PII leak in `message` field
- `BUG-log-files-created-world-readable-0644.md` — file-mode 0644 exposes logs to other users
- `BUG-nsfw-gate-log-plaintext-pii.md` — NSFW gate logs plaintext PII
- `BUG-nsfw-moderation-delete-destroys-audit-log.md` — moderation deletes audit log
- `BUG-telemetry-purge-unbounded-days.md` — telemetry purge has no retention cap
- `TASK-split-logger-god-module.md` — logger module split (in progress)
- `epic-database-backup-recovery.md` — backup pipeline (GPG-encrypted)

## Problem

Today `log_entries` and `telemetry_events` live in the **same SQLite database**
as the rest of the application data (chats, messages, assets, characters,
`request_results`, etc.). This raises operational, security, and performance
concerns that grow with deployment scale:

### Operational

- **Backup coupling** — `scripts/backup-sqlite.sh` (TASK-BKP-001) copies
  the entire SQLite file. Logs and telemetry dominate row count by 10×-100×
  in busy deployments; backup size + duration are driven by logs, not app
  data. Restore-time and restore-storage cost grow with log retention.
- **Restore granularity** — when a chat-table corruption is fixed by
  restoring a backup, the operation also rolls back `log_entries` —
  destroying the audit trail. Conversely, purging old logs requires
  backup of the full DB. Logs and app data have orthogonal lifecycles.
- **Migration coupling** — every schema change to `log_entries` is a
  forward-only migration on the **app DB** (same as
  `request_results` migration `067_request_results.ts`). Schema changes
  must coordinate across all instances; logging-only schemas cannot be
  rolled out independently.

### Security

- **PII co-location** — logs frequently contain usernames, IPs, chat
  fragments, NSFW gate decisions (`BUG-nsfw-gate-log-plaintext-pii`),
  and (per `TASK-logger-censor-bypasses-message-field-pii-secret-leak`)
  plaintext `message` field. Co-locating with chat data means a single
  DB read grants access to both.
- **File permissions** — `BUG-log-files-created-world-readable-0644`
  shows JSONL files written with default umask; when logs move out of
  the DB into files, the same mistake will recur unless the storage
  path is hardened in the same PR.
- **Encryption asymmetry** — the DB is GPG-encrypted at rest
  (TASK-BKP-001), but logs often want **per-entry tamper-evidence**
  (signing) that the app DB doesn't need. A separate store can be
  signed + append-only.

### Performance

- **Write amplification** — `log_entries` is the highest-write-rate
  table in busy deployments. SQLite WAL mode serializes log writes
  with app writes, creating contention. A separate store can use
  batched async writes (already a pattern in `src/async/store.ts`).
- **Read amplification** — log queries (admin dashboards, audit
  reports) scan the same DB pages as chat queries; cache pressure
  hurts both workloads.

## Research questions

1. **Should logging be a separate SQLite file, a separate Postgres
   schema/database, or an external store (Loki / ClickHouse / S3 +
   Athena)?** Each option has different blast radius, ops complexity,
   and capability tradeoffs.

2. **What is the migration path from the current `log_entries` table
   to the chosen store?** Forward-only per AGENTS.md; the existing
   `log_entries` rows must be drained (export to the new store, mark
   `status='migrated'`) before the table can be dropped.

3. **Does the same recommendation apply to `telemetry_events`?** It
   has the same write-rate / size concerns but different PII exposure
   (more aggregate, fewer chat fragments). One decision or two?

4. **What about `request_results` (worktree `feat-middleware-request-lifecycle`)?**
   Its `response_body` may carry user content (LLM completions).
   Should it move to the same store, or stay in the app DB?

## Scope

### In scope

- Survey the 4 viable options (separate SQLite, separate Postgres
  schema, separate Postgres database, external log store).
- Compare each option against the operational, security, and
  performance concerns above.
- Recommend one option for the SQLite deployment (current dev/prod
  baseline) and one for the Postgres deployment (the documented
  multi-instance target).
- Document the migration path: code changes, schema changes,
  operational changes, rollout strategy, rollback strategy.
- Document the answer to question 3 (telemetry) and question 4
  (`request_results`) — may be "same as logs", "same as app data",
  or "needs separate analysis".

### Out of scope

- **Implementation.** This is research only. Tickets for
  implementation land after the decision.
- **Log format redesign.** JSONL format work is done
  (`TASK-unify-logging-output-to-canonical-jsonl`); no further
  format changes are needed for the storage choice.
- **Log level / trace-fatal work.** Done in `epic-logging-telemetry.md`.
- **Censor / PII redaction.** Existing tickets
  (`TASK-logger-censor-bypasses-message-field-pii-secret-leak`,
  `BUG-nsfw-gate-log-plaintext-pii`) address PII in the logger
  itself; this research assumes the censor is correct and focuses
  on where the censored output lives.

## Acceptance Criteria

- [ ] Survey of 4 storage options with pros/cons for each.
- [ ] Concrete recommendation for SQLite deployment (current baseline).
- [ ] Concrete recommendation for Postgres deployment (multi-instance target).
- [ ] Migration plan: forward-only steps, drained state, rollback.
- [ ] Decision documented for `telemetry_events`: same store or separate.
- [ ] Decision documented for `request_results`: same store or app DB.
- [ ] Estimated ops impact: backup size delta, restore-time delta,
  write-rate delta (qualitative per AGENTS.md, no specific numbers
  without measurement).
- [ ] Open questions / risks surfaced for human decision.

## Method

1. **Read existing tickets + code** — `src/logger/transports/`,
   `src/db/migrations/005_utility_tables.ts`,
   `TASK-data-level-integrity-checksums-and-re-readable-logical-dumps`,
   `TASK-sqlite-backup-research`, `TASK-disaster-recovery-research`,
   `epic-database-backup-recovery`, `epic-multi-instance-reconciliation`.
2. **Inspect log volume** — approximate row counts and write rate
   per table (qualitative; actual numbers depend on deployment).
3. **Compare storage options** — for each, evaluate:
   - Write rate (rows/sec sustainable)
   - Query patterns supported (admin dashboard, audit, replay)
   - Operational complexity (extra process, backup story, monitoring)
   - Postgres compatibility (does it work with both backends?)
   - Migration cost (one-time + ongoing)
   - Failure modes (what happens if the log store is down?)
4. **Recommend** with explicit reasoning. State the decision
   criteria; if multiple options are viable, list the tie-breakers.
5. **Migration plan** — concrete steps, ordered by dependency. Mark
   which steps are reversible.

## Notes

- The async result store (`src/async/store.ts`) already follows a
  pattern of "background queue + drain to DB + spill to disk on
  threshold". That same pattern works for a separate DB target —
  the `request_results` queue can drain to the new log store with
  only the writer module changed.
- The user's framing "separate db for logging" is ambiguous between
  "separate SQLite file" and "separate logical database" (Postgres
  has both DATABASE and SCHEMA as separation primitives). The
  research must explicitly disambiguate.
- This ticket is research-only. Do NOT touch code or migrations.
  Deliverable: this ticket file updated with the findings.
