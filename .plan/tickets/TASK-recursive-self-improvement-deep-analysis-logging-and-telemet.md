<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Deep-Analysis Logging + Telemetry — Structured Traces for Agent Diagnostics

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** (set per-ticket)
**Type:** Feature Task / Observability
**Tags:** logging, telemetry, deep-analysis, structured, tracing, observability, agent-diagnostics
**Epic:** epic-recursive-self-improvement

Upgrade `src/logger/` + `src/telemetry/` for **deep post-hoc analysis** of agent interactions, watchdog events, and CI gate runs. Adds structured trace IDs, sampled span export, JSONL archive, and a query CLI for human/agent triage.

## Why

Today's logger (`src/logger/`) and telemetry (`src/telemetry/`) emit structured records but:

- **No cross-system trace IDs** — an agent request that touches watchdog (#1), worktree spawn (#6), check stream (#7), commit (#8), and finalize (#8) emits 5+ log records with no shared correlation key
- **No archive** — `flush()` writes to stdout/stderr + DB transport; nothing persists for offline analysis
- **No query tool** — finding "all check-stream failures on the watchdog-supervisor branch in the last 24h" requires a SQL query
- **No sampling control** — every record is emitted; high-volume agent sessions blow up the DB transport
- **No span tree** — no parent/child relationship between watchdog events and agent actions they triggered

## Core Features

- **Trace IDs**: every agent API request gets a `trace_id` (ULID); all log/telemetry records spawned under it inherit the ID. Reuse `src/logger/correlation.ts` if present, else add `src/logger/correlation.ts`
- **Span model**: each top-level operation (e.g. `agent.check.run`) opens a span; child spans for sub-operations (gate execution, process spawn, file IO). Spans have `parent_span_id`, `start_ms`, `end_ms`, `status`, `attributes`
- **JSONL archive**: `src/logger/archive.ts` writes one JSON object per line to `tree/.tmp/logs/<date>.jsonl.gz` (rotated daily, gzipped); separate from live stdout/DB
- **Sampling**: `src/logger/sampling.ts` — configurable rate (default 1.0); per-route override (`/api/v1/agent/*` can sample 1.0 while `/api/chats/*` samples 0.01)
- **Query CLI**: `bun run logs:query --trace <id>` returns all records for a trace; `bun run logs:query --since 24h --gate watchdog --status fail` for time-windowed queries
- **TUI**: `bun run logs:tui` — interactive browse by trace/spans/gates (uses blessed, already a dep)
- **Backfill**: existing logs (since the last flush) are not retroactively traced; new instrumentation starts from the merge commit
- **Privacy**: hash user IDs (per `BUG-telemetry-stores-raw-client-body-real-user-chat-session-ids`); never log API keys (per Aug-25 security review)

## Acceptance Criteria

- [ ] Trace ID propagates through every agent API call; verified by `bun run logs:query --trace <id>` returning ≥3 records from a single agent check-stream session
- [ ] JSONL archive written to `tree/.tmp/logs/<date>.jsonl.gz`; rotation at 00:00 UTC; retention 30 days default
- [ ] Sampling rate configurable via `LOOP_LORE_LOG_SAMPLE_RATE` env var; per-route override via `src/config/schema.ts`
- [ ] Query CLI returns records in <500ms for a 24h window against a 10MB archive
- [ ] TUI shows trace tree with span timings + status (test against a seeded fixture)
- [ ] Privacy: no raw `user_id` / `chat_id` / API keys in any archived record (audit fixture confirms)
- [ ] Existing logger tests still pass; no regression on `bun run check`

## Files

- `src/logger/correlation.ts` — new (trace_id, span_id propagation)
- `src/logger/spans.ts` — new (span model, parent/child)
- `src/logger/archive.ts` — new (JSONL writer + rotation)
- `src/logger/sampling.ts` — new (rate + per-route override)
- `src/logger/index.ts` — wire new modules
- `scripts/logs-query.ts` — new (CLI)
- `scripts/logs-tui.ts` — new (blessed TUI)
- `src/config/schema.ts` — extend with `logging.archive`, `logging.sampling`
- `src/logger/archive.test.ts` — new
- `src/logger/sampling.test.ts` — new
- `docs/ops/logging-telemetry.md` — new (runbook + retention policy)

## Notes / Verification

- **Existing logger**: `src/logger/` already has levels, rotation, censor. Reuse the rotation logic for JSONL daily files; add a second sink rather than replace.
- **Existing telemetry**: `src/telemetry/` is event-bus style; integrate as a separate transport into `src/logger/transports/` so spans can also emit telemetry events.
- **Reference patterns**: OpenTelemetry trace context (`traceparent` header) is the closest analog; consider adopting W3C trace context for cross-process tracing if/when #5 (agent router) ships inter-service calls.
- **Blessed**: already a dep (`src/tui/` uses blessed); reuse for TUI.
- **Privacy review (Aug-25, 2026)**: this ticket MUST maintain the existing redaction posture. New fields default-redact unless explicitly whitelisted in `src/logger/censor.ts`.

## Risks

- **Disk pressure**: JSONL archive can grow fast under high agent activity. Default retention 30 days + size cap (default 1GB per day); document override.
- **Performance**: span tracking adds ~5-10% overhead per log call. Mitigate with sampling at the source, not at the sink.
- **Privacy regressions**: easy to leak a new field by accident. Add a `bun test src/logger/privacy.test.ts` that asserts NO raw `user_id`/`chat_id`/API key in any archived record (snapshot diff against a known-safe baseline).

