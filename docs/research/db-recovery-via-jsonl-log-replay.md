<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# DB recovery via canonical JSONL log replay — feasibility research

**Ticket:** TASK-db-recovery-via-canonical-jsonl-log-replay-research
**Date:** 2026-09-18 · **Scope:** research-only, no implementation

## 1. Question

Can the canonical JSONL logs (`src/logger/`, one object per line via `FileTransport`) serve as a recovery path when the `epic-database-backup-recovery` backup/rollback is unavailable — i.e. restore = baseline snapshot + replayed JSONL between `snapshot_at` and `target_at`?

## 2. What the logs actually capture today

| Layer | Captured | Reconstructible row-level writes? |
| --- | --- | --- |
| `LogEntry` (`src/logger/types.ts`) | `level`, `timestamp`, `time`, `message` (string or object), `module`, `requestId`, `userId`, `sessionId`, `error`, `meta` | **No.** `message` is free text; `meta` is post-censor structured data but has no enforced schema and no `before`/`after` row images. |
| `FileTransport` (`src/logger/transports/file.ts`) | one JSON object per line, rotation at `jsonlMaxBytes` (default 100 MB) × `jsonlMaxFiles` (default 5) | Bounded window only: ~500 MB of history, silent loss of anything older. Rotation errors are swallowed — a truncated replay window is undetectable after the fact. |
| `DBTransport` (`src/logger/transports/db.ts`) | `level`, `meta.event_type`, `meta.entity_type`, `meta.entity_id`, `action` into `log_entries` | Ironically the DB transport *is* the audit trail — but it lives **inside** the DB it would need to restore. Any DB corruption that defeats backup also defeats this trail. |
| Service-level emitters (`src/assets/*`, growth/mood services, danger-zone `audit()`) | `event_type`/`entity_type`/`entity_id`/`action` | Narrative breadcrumbs, not row images. `action: "purge-audit"` tells you a purge happened; it does not carry the deleted rows. |

**Finding:** today’s JSONL stream is an *observability* log, not a *write-ahead* log. No `INSERT/UPDATE/DELETE`-class event carries before/after row images, table names are not consistently present, and ordering across writers is by wall-clock `timestamp`, not a monotonic sequence.

## 3. Inventory: fully vs partially vs not reconstructible

- **Fully reconstructible from logs:** nothing. No entity type round-trips.
- **Partially reconstructible (breadcrumbs):** asset lifecycle (`controller.ts`, `service/*` emit entity events), character growth/mood events, admin danger-zone actions (`purge-audit`, `reset-settings`, `factory-reset` with timestamps). Enough to answer “what happened when”, not “what was the row”.
- **Not captured at all:** direct Kysely writes in routes/services that never emit a log line; queued-but-unflushed entries (`AsyncLogQueue` drops on crash); any write in a code path that logs at `debug`/`trace` in production (below the configured floor).

## 4. JSONL vs SQLite WAL

| Dimension | SQLite WAL (`PRAGMA journal_mode = WAL`, `src/db/index.ts:35`) | JSONL replay |
| --- | --- | --- |
| Granularity | page-level, exact | message-level, lossy |
| Ordering | total, crash-consistent | wall-clock, cross-writer races |
| Coverage of same window | every committed write | only paths that log |
| Survives DB file corruption? | No (WAL is part of the DB) | **Yes** — file transport writes to a separate path. This is JSONL’s one real advantage. |
| Survives disk/filesystem loss? | No | Only if shipped off-box (not done today). |
| Idempotent replay | n/a (not a replay log) | Not idempotent today: no dedup keys, no sequence numbers. |

**Implication:** JSONL does not overlap WAL — it covers a *different failure mode* (DB file destroyed but log volume intact). It cannot replace backup; at best it is a tertiary triage source.

## 5. What would make it viable (cost)

1. **Instrumented write envelope** on every mutating service call: `{ table, op, pk, before, after, seq, actor, at }`. Touches every service — large diff, performance cost on the hot path (log write per mutation), doubles storage for wide rows.
2. **Monotonic sequencer** (single writer or Lamport clock) so replay order is deterministic across processes.
3. **Retention contract**: rotation today silently discards history. Recovery needs a *guaranteed* window (e.g. “≥7 days of mutations”), which means size-bounded rotation is wrong — time-bounded retention with backpressure or off-box shipping is required.
4. **Idempotent applier**: upsert-by-pk with seq fencing; replay must be safely re-runnable.
5. **Encrypted-at-rest story**: if DB encryption lands, the log volume carries the same secrets and needs the same key management — otherwise the log becomes the exfiltration path.
6. **Asset side-effects**: DB rows reference files; replay recreates rows but not blobs. Needs the asset snapshot story from `epic-db-asset-snapshot-recovery` anyway.

Rough cost: storage ~1.5–2× current log volume (row images on top of messages); engineering ~2–4 tickets for the envelope + sequencer + applier + retention, plus per-service instrumentation follow-ups. Not cheap.

## 6. Decision

**Secondary at most — not primary, not parallel backup today.**

- As *primary* (replaces backup): **unsound.** Coverage is partial, ordering is racy, retention is silently bounded, replay is not idempotent.
- As *parallel backup*: **not yet.** Without the write envelope (cost item 1) the second copy carries no restorable data.
- As *triage aid*: **viable now.** Even unenriched logs answer “what was the last admin action before the outage” (danger-zone audit lines survive DB loss via the file transport). Keep file transport on, ship it off-box if cheap.

## 7. Recommendation

1. **Do not build replay now.** Close this research with the triage-aid posture: file transport stays, no replay implementation scheduled.
2. **Cheap hardening (optional, one ticket):** add `event_type`/`entity_type`/`entity_id` to the highest-value mutating paths (danger-zone, asset delete, user delete) so the triage story improves without the full envelope.
3. **Gate the full envelope** on `epic-database-backup-recovery` Phase 2: if backup/restore proves insufficient in practice, revisit with the cost list in §5 as the implementation plan.
4. **No new implementation tickets filed** — §5 is the plan if the decision ever flips.
