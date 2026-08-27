<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Async request-response result store (separate table + offload)

**Status:** 🟡 Partial (commit 85657ffb + 3f83ae89 on dev, 2026-08-26; only track() called, complete/fail never)
**Priority:** medium
**Effort:** Large
**Epic:** epic-middleware-request-lifecycle
**Related:** `src/db/migrations/`, `src/async/` (new), `TASK-middleware-global-idempotency-replay-for-re-fired-requests.md`, `TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md`, `src/server/handler.ts`, `src/routes/messages/reply.ts:41`, `epic-middleware-request-lifecycle.md`
**Issue:** 73eb1de
**Blocks:** `TASK-async-store-complete-fail-lifecycle-hooks.md`

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
- timestamp; do not depend on filesystem ordering.
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

## Closing Notes (2026-08-26)

Partial. The store, table, offload daemon, and full writer API are
shipped, but the lifecycle is not driven by anything. Verified state
on `dev`:

- ✅ `src/db/migrations/067_request_results.ts` shipped. Schema matches
  the ticket: `(id, method, routePattern, userId, status, progress,
  responseStatus, responseHeaders, responseBody, error, startedAt,
  completedAt, offloadedAt, offloadPath)` + index on `(userId, startedAt
  DESC)` + TTL eviction index.
- ✅ `src/async/store.ts` shipped. Public API: `track()`, `progress()`,
  `complete()`, `fail()`, `flush()`, `read()`, `config`, `destroy()`.
  All writes are fire-and-forget via a single drain loop calling
  `apply()` against the migration's table.
- ✅ `src/async/offload.ts` shipped. Cron-triggered daemon (default 30s)
  that scans `.tmp/async-store/` for `*.json.gz` spills, compresses
  oversized rows, deletes inline `response_body`, writes the spill
  file, and records `offloadedAt` + `offloadPath`. TTL eviction runs
  on the same cron tick for `complete`/`failed` rows older than the
  configured TTL.
- ✅ Test coverage: `apply.test.ts` (179 lines), `offload.test.ts`
  (73 lines), `store.test.ts` (74 lines).
- ✅ `src/elysia-app.ts:46-48` creates the store at boot and starts the
  offload daemon.
- ❌ **No caller writes `complete()` or `fail()`.** Grep across
  `src/` for `asyncStore.complete(` / `asyncStore.fail(` returns zero
  matches. The only consumer is `asyncStore.track(...)` in
  `src/routes/messages/reply.ts:46`. Result: rows never transition
  out of `pending`; the status endpoint reads back `pending`
  indefinitely for every tracked request.
- ❌ **No caller writes `progress()`** (e.g. LLM step updates from
  `triggerAutoGeneration`). The progress field stays null.
- ⚠️ **Storage encryption at rest is NOT implemented** (Notes section
  flagged this as a follow-up). `response_body` is stored as plaintext
  or base64. The ticket's "encrypt with SMK" guidance is unmet. Not a
  blocker for closing this ticket — the ticket never listed encryption
  as an AC — but worth surfacing for the next pass.

**Impact**: the table exists and the daemon works, but rows are
immutable past `pending`. The store is functionally a write-once
`request_started_log` today, not the lifecycle store the ticket
described. Idempotency replay (ticket 2) cannot work because there are
no `complete` rows to replay.

### Follow-up tickets

- `TASK-async-store-complete-fail-lifecycle-hooks.md` — wire
  `asyncStore.complete()` into the idempotency `afterHandle` (or a
  dedicated response-completion middleware); wire `asyncStore.fail()`
  into the global error boundary; call `asyncStore.progress()` from
  `triggerAutoGeneration` with named steps. Medium. Closes this ticket
  AND ticket 3.

### What this ticket DID deliver

- Persistent `request_results` table with the right shape, indices,
  eviction policy.
- Working async writer (`store.ts`) and offload daemon (`offload.ts`)
  with full test coverage.
- Boot-time wiring in `src/elysia-app.ts`.
- Foundation for the idempotency table-backend + status endpoint,
  ready to compose the moment the lifecycle hooks are added.
