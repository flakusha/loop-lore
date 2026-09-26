<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Logging & Structured Logging

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** ⬜ Not Started
**Priority:** Medium

## Summary

Canonical structured-logging surface across server + worker processes, with stable field names, deterministic ordering, and redaction guarantees. Every log line is one JSON object on stdout (canonical JSONL) — never free-text — so logs are queryable by `bun run telemetry:query` and ingestable by `epic-observability-telemetry.md` without post-processing.

**Context:** The 2026-08-07 logging hardening (`epic-logging-telemetry.md`) shipped a canonical JSONL output and `logFatal` / `logTrace` call-sites across the codebase. This epic generalizes the pattern across all subsystems that still emit free-text logs, defines the contract for log levels + redaction, and surfaces the missing endpoints (`/api/telemetry`, `telemetry:query`).

## Scope

### Contract

- **Format:** one JSON object per line on stdout; no pretty-printing, no ANSI escape sequences in JSON.
- **Required fields:** `ts` (ISO-8601 UTC with ms), `level` (`trace|debug|info|warn|error|fatal`), `service` (loop-lore-server / loop-lore-worker / loop-lore-migration), `request_id`, `actor_id?`, `user_id?`, `event` (kebab-case stable identifier, e.g. `chat.message_posted`), `msg` (human-readable), `data?` (structured payload).
- **Levels:** `fatal` reserved for unrecoverable; `error` for user-facing failures; `warn` for recoverable; `info` for audit-grade; `debug` and `trace` gated on `LOG_LEVEL`.
- **Redaction:** every log line goes through a redaction filter that scrubs `authorization`, `cookie`, `set-cookie`, `x-user-secret`, and any field in `data` named in `src/logging/redact-list.ts`.
- **Sink rotation:** `epic-runtime-integrity-fail-safes.md` owns the rotation daemon; this epic defines the rotation signal (SIGUSR1 + reopen).

### API surface

- `getLogger(name: string)` — typed wrapper that exposes `info`, `warn`, `error`, `fatal`, `trace`, `debug`, and child loggers (with inherited context).
- `/api/telemetry` (admin-only) — last 1k log lines, paged.
- `bun run telemetry:query <field>=<value>` — ad-hoc filter over `/var/log/loop-lore/*.jsonl`.
- Sinks: stdout (canonical), optional file (`LOG_FILE=...`), optional OTLP (`OTLP_ENDPOINT=...`).

### Out of scope

- Aggregation / dashboarding — owned by `epic-performance-dashboard-slo.md`.
- Distributed tracing — partially implemented; full tracing is `epic-observability-telemetry.md`.

## Acceptance Criteria

- [ ] `getLogger` is the **only** log entry point; `console.log` / `console.error` removed from `src/` (lint enforced).
- [ ] All canonical fields present; redaction verified for 20 known sensitive keys.
- [ ] `telemetry:query` works against `/var/log/loop-lore/*.jsonl`; sub-second on 1GB logs.
- [ ] OTLP sink optional and gated; default off.
- [ ] Tests cover redaction, level filtering, child-logger context propagation.

## Related Epics

- `docs/spec/logging.md`
- `epic-logging-telemetry.md` — partial implementation already shipped
- `epic-observability-telemetry.md` — tracing + dashboards
- `epic-runtime-integrity-fail-safes.md` — log rotation signal
- `epic-security-sandboxing.md` — redaction list

## Tickets

