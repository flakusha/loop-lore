# EPIC: Logging & Telemetry — Complete Level Set + Canonical JSONL

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Infrastructure Epic
**Tags:** logging, telemetry, logger, jsonl, observability, levels, trace, fatal

## Summary

The logging layer (`src/logger/`) is well-structured — typed `Logger` interface, async
queue, censoring, size limits, console + DB transports — but two gaps block it from being a
production observability foundation:

1. **The level set is incomplete.** `LogLevel` (`src/db/enums-config.ts`) defines only
   `debug | info | warn | error`. There is no `trace` or `fatal`, so the `log.fatal` /
   `log.trace` API surface the user wants cannot exist yet. `Logger` (`src/logger/types.ts`,
   `src/logger/logger.ts`) exposes only `debug/info/warn/error`.
2. **Output format is not unified.** A JSONL serializer already exists
   (`formatJSONL` in `src/logger/formatters.ts`, unit-tested) but it is used **only as a
   stderr fallback** inside `src/logger/queue.ts`. The default human path is
   `formatConsole` (pretty ANSI) via `ConsoleTransport`, and there is **no file transport**
   writing structured JSONL to disk. `DBTransport` writes structured rows to `log_entries`.

## Problem

- `fatal` and `trace` levels are absent end-to-end: `LogLevelNumeric` (`types.ts:8-13`)
  maps 10/20/30/40, `levels.ts` (`levelFromConfig`, `numericToLabel`) covers only
  10/20/30/40, `formatters.ts` level colors cover only 10/20/30/40, and
  `ConsoleTransport` routes only `level >= 30` to stderr.
- Fatal-event sites today degrade to `log.error(...)` + `process.exit(1)` (e.g.
  `src/build/compress.ts`, `src/config/generate-schema.ts`, `generate-domain-schemas.ts`,
  `generate-toml-schema.ts`) with no dedicated `log.fatal`. High-frequency low-noise paths
  have no `log.trace` option to avoid drowning `info` output.
- JSONL serialization exists but is not the canonical output; logs are split between
  human console format and DB rows, with no uniform machine-readable artifact.

## Scope

1. **Add `trace` + `fatal` levels end-to-end.** Extend `LogLevel` enum, `LogLevelNumeric`
   (e.g. `trace: 5`, `fatal: 50`), `levels.ts` (`levelFromConfig`, `numericToLabel`),
   `formatters.ts` (`LEVEL_COLORS`, `LEVEL_CSS`, JSONL), and the `Logger` interface +
   `LoggerImpl` with `trace()` and `fatal()` methods. Update/extend unit tests
   (`levels.test.ts`, `formatters.test.ts`, plus logger impl coverage).
2. **Unify output to canonical JSONL.** Add a `FileTransport` writing one JSON object per
   line to a configured path; make JSONL the canonical machine-readable output (default
   non-TTY / file target), keep `formatConsole` only as the human TTY presentation, and
   ensure `DBTransport` + JSONL share one serialization of a unified `LogEntry` schema
   (level, timestamp, module, requestId, userId, sessionId, error, meta).
3. **Insert `log.fatal` / `log.trace` calls at key sites.** Convert crash-and-exit paths
   (`process.exit(1)` after error, startup/irrecoverable failure, uncaughtException /
   unhandledRejection handlers) to `log.fatal`; add `log.trace` to high-frequency/low-noise
   code paths (request/parse/regex/debug internals) so `info` stays meaningful.
4. **Verify no regression.** `bun run check` + `bun test src/` green; console/DB/JSONL all
   emit the same `LogEntry`.

## Current State

- Levels: `LogLevel = "debug" | "info" | "warn" | "error"` (no `trace`/`fatal`).
- API: `Logger.debug/info/warn/error`, `child`, `addTransport`, `setBindings`, `flush`.
- Formats: `formatConsole` (pretty ANSI/CSS, default) + `formatJSONL` (exists,
  unused as primary). Transports: `ConsoleTransport`, `DBTransport`; async `AsyncLogQueue`.
- Fatal sites collapse to `log.error` + `process.exit(1)`.

## Linked Tasks

| Task                     | Title                                        | Priority | Status      |
| ------------------------ | -------------------------------------------- | -------- | ----------- |
| TASK-log-add-trace-fatal | Add `trace` + `fatal` levels and API methods | High     | Not Started |
| TASK-log-jsonl-format    | Unify logging output to canonical JSONL      | High     | Not Started |
| TASK-log-call-insertion  | Insert `log.fatal`/`log.trace` at key sites  | Medium   | Not Started |
| TASK-log-verify          | Verify check + tests + all transports agree  | Medium   | Not Started |

## Acceptance Criteria

- [ ] `LogLevel` includes `trace` and `fatal`; `Logger` exposes `log.trace` and `log.fatal`
- [ ] `trace`/`fatal` flow through numeric mapping, labels, colors, JSONL, console stream routing
- [ ] JSONL is the canonical machine output; `FileTransport` writes one JSON line per entry;
      console TTY keeps human presentation
- [ ] Crash-and-exit paths use `log.fatal`; high-frequency paths use `log.trace`
- [ ] No regression: `bun run check` + `bun test src/logger/` green; console/JSONL/DB agree

## Related Epics

- `epic-analytics-observability.md` — telemetry/analytics consumption (adjacent, distinct scope)
- `epic-code-quality.md` — cross-cutting quality conventions (logger used repo-wide)
