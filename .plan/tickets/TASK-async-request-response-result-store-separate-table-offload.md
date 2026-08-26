<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Async request-response result store (separate table + offload)

**Status:** ⬜ Open
**Priority:** medium
**Effort:** Large
**Epic:** epic-middleware-request-lifecycle
**Related:** `src/db/migrations/`, `src/async/` (new), `TASK-middleware-global-idempotency-replay-for-re-fired-requests.md`, `TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md`, `src/server/handler.ts`, `src/routes/messages/reply.ts:41`, `epic-middleware-request-lifecycle.md`
**Issue:** 73eb1de

## Summary

Add a dedicated `request_results` table and an `src/async/store.ts` writer
that captures the outcome of every (idempotency-tracked) request —
status, timing, response body, response headers, error if any — and an
offload daemon (`src/async/offload.ts`) that compresses and spills rows
to disk based on cron / size / load / idle thresholds. The store backs
the idempotency replay layer
(`TASK-middleware-global-idempotency-replay-for-re-fired-requests.md`) and
the in-progress status endpoint
(`TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md`).

## Context

- The user explicitly asked for "separate table / db for request-response
  results (and potential in-between monitoring) → async, non-blocking,
  compressable/dumpable into separate files based on cron/size/load/idle".
  The current `dev` branch has nothing in this area; LLM auto-generation
  is fire-and-forget with no observable result (`src/routes/messages/reply.ts:41`).
- Schema lives in `src/db/migrations/*.ts` (single source of truth). After
  adding the migration, regenerate the downstream artifacts per
  `AGENTS.md`: `bun run db:sync-types && bun run db:sync-manifest`, then
  verify `bun run db:schemas:check`.
- Body capture must be non-blocking: do not buffer multi-MiB SSE streams
  into the table. Cap the captured body size (default 1 MiB) and skip
  larger bodies (record `body_truncated: true`).
- Offload target: `.tmp/async-store/` is the default per AGENTS.md scratch
  rules; make the dir configurable so production deployments can point at
  a dedicated volume. Offloaded files are content-addressed by request id
  + timestamp; do not depend on filesystem ordering.
- Compression: gzip via `Bun.gzipSync` for completed entries older than
  the offload window.

## Acceptance Criteria

- [ ] New migration `src/db/migrations/XXXX_request_results.ts` creates
  `request_results` with columns:
    - `id` (UUID, PK) — request id from
      `TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md`;
    - `method`, `route_pattern` (normalized) — for replay key;
    - `user_id` (nullable, for auth-scoped replay);
    - `status` (TEXT, enum-checked: `pending` | `in_progress` | `complete`
      | `failed` | `expired`);
    - `progress` (TEXT, JSON, nullable);
    - `response_status` (INTEGER, nullable until complete);
    - `response_headers` (TEXT, JSON, nullable);
    - `response_body` (BLOB, nullable, capped at config max);
    - `response_body_truncated` (BOOLEAN, default false);
    - `error` (TEXT, nullable);
    - `started_at` (INTEGER, ms epoch);
    - `completed_at` (INTEGER, nullable);
    - `offloaded_at` (INTEGER, nullable) — set when the row's blob is
      spilled to disk and the row is freed;
    - `offload_path` (TEXT, nullable).
  Plus an index on `(method, route_pattern, id)` and on `started_at` for
  offload scans.
- [ ] Regenerated artifacts (`src/db/schema-*.ts`,
  `src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`,
  `src/validation/db-schemas.ts`) compile and `bun run db:schemas:check`
  is green.
- [ ] New `src/async/store.ts` exports:
    - `recordRequestStart(id, opts)` — inserts `pending` row, non-blocking
      (fire-and-forget with structured logger on failure);
    - `recordRequestProgress(id, progress)` — updates the `progress`
      column, non-blocking;
    - `recordRequestComplete(id, response)` — captures status/headers/body,
      updates to `complete`;
    - `recordRequestFailed(id, error)` — updates to `failed`;
    - `getRequestResult(id)` — read; falls back to offloaded file when
      `offloaded_at IS NOT NULL`;
    - `evictExpired(ttlMs)` — purges rows older than TTL.
- [ ] New `src/async/offload.ts` exports a daemon that scans the table on
  the configured interval (default 5 min) and offloads rows where:
    - `completed_at` is older than `offloadAgeMs` (default 1h), OR
    - the table row count exceeds `offloadSizeThreshold` (default 10k
      rows), OR
    - DB write latency (p95 over the last minute) exceeds
      `offloadLoadThresholdMs` (default 50ms), OR
    - the row has been idle (`last_touched_at`) longer than
      `offloadIdleMs` (default 24h).
  Offload writes a gzipped JSON to `<offloadDir>/<yyyy>/<mm>/<dd>/<id>.json.gz`
  and updates the row with `offloaded_at` + `offload_path`. The daemon is
  started by `src/server/start.ts` alongside the rest of the long-running
  services.
- [ ] All writes from the request lifecycle are non-blocking; the request
  handler awaits the in-memory cache write only. The DB persistence is
  background. On DB failure, the request is NOT failed — log and proceed;
  the in-memory cache still serves idempotency replay within the process.
- [ ] The migration is reversible; `bun run db:migrate:down` (or the
  project's equivalent) drops the table cleanly.
- [ ] Unit + integration tests:
    - insert + read round-trip for each status transition;
    - body cap truncates and sets the flag;
    - offload moves the blob to disk and the row to the offloaded state;
    - `getRequestResult` reads from disk when offloaded;
    - TTL eviction removes old rows;
    - offload triggers on size, age, load, idle.
- [ ] `epic-middleware-request-lifecycle.md` sub-ticket checkbox marked done.

## Notes

- The offload dir default is `.tmp/async-store/` per AGENTS.md scratchpad
  rules. Document the production override in the config schema.
- Schema is a normal migration; do NOT add a Kysely type by hand —
  regenerate via `bun run db:sync-types` after the migration lands.
- Coordinate with `epic-llm-queue.md` if the queue wants to share this
  table for "queued" status; the in-progress enum is intentionally
  separate from the LLM queue's "queued / scheduled" states so the
  concerns do not entangle.
- Consider encryption at rest for `response_body` if it may carry user
  content (it can — the body of a successful message create contains
  message text). Coordinate with `src/crypto/`; the simplest correct
  starting point is to encrypt with the existing SMK, then a per-request
  data key if volume justifies it. Mark this as a follow-up if the
  initial implementation stores plaintext behind the same access
  controls as the rest of the data.
- Offload is intentionally one-way at first: there is no rehydrate path
  that moves an offloaded row back into the table. Re-reads are served
  from disk. If hot-rehydrate is needed later, that is a follow-up
  ticket.
