<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: API task offloading (background worker dispatch)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Summary:** Move long-running API calls (image generation, batch embeddings, RAG ingestion, content analysis) to a background worker so request-handling latency stays under SLO. The dispatcher hands a job to the worker, returns 202 Accepted with a polling URL, and the worker emits an SSE/completion event when done.
**Context:** Today several API routes block the request thread on expensive synchronous work (image gen, batch processing). This makes p99 latency unpredictable and ties Bun worker threads to in-flight HTTP. A background-worker queue (registered via `src/cron/registry.ts`) gives the operator visibility into job backlog, retry semantics, and a graceful shutdown path. The `EPIC-API-TASK-OFFLOADING` and `EPIC-API-GOVERNANCE` epics both reference this ticket.
**Acceptance Criteria:** [ ] `POST /api/jobs` accepts a typed job spec (`{ kind, payload, idempotencyKey? }`) and returns `{ id, status: "queued" }` (202 Accepted). [ ] Background worker drains the queue (`src/cron/registry.ts` already wired); jobs run with bounded concurrency (`config.jobs.concurrency`). [ ] `GET /api/jobs/:id` returns the current status; `GET /api/jobs/:id/result` returns the payload once completed. [ ] Idempotency: a second `POST` with the same `idempotencyKey` returns the existing job, not a duplicate. [ ] Failures retry with exponential backoff up to `maxAttempts`; after that, the job is marked `failed` with the last error attached. [ ] Tests cover: happy path, idempotency, retry-then-success, retry-exhausted-failed, graceful shutdown drains the in-flight job before exit. [ ] `bun run check` green.
**Epic:** epic-api-task-offloading
**Tags:** api, jobs, offloading, background, async, queue
**Related:** src/cron/registry.ts (job registry), src/async/offload-daemon.ts (offload client), EPIC-API-GOVERNANCE


git issue: d904378
