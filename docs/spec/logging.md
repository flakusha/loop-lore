<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Logging

Unified structured logging. Zero deps. Async queue + PII censor + JSONL/DB transports.

## Source Files

| File                               | Purpose                                           |
| ---------------------------------- | ------------------------------------------------- |
| `src/logger/index.ts`              | `createLogger`, `getLogger`, `setGlobalLogger`     |
| `src/logger/types.ts`              | `LogEntry`, `Logger`, `Transport`, `LogLevelNumeric` |
| `src/logger/levels.ts`             | `levelFromConfig`, `numericToLabel`, `shouldEmit` (Trace:5 … Fatal:50) |
| `src/logger/formatters.ts`         | `formatConsole`, `formatJSONL`                     |
| `src/logger/censors.ts`            | Field-glob PII engine + `DEFAULT_RULES`            |
| `src/logger/limits.ts`             | Entry size caps + truncation                       |
| `src/logger/transports/console.ts` | `ConsoleTransport` (always active)                 |
| `src/logger/transports/file.ts`    | `FileTransport` (JSONL, size-based rotation)       |
| `src/logger/transports/db.ts`      | `DBTransport` (`log_entries`, opt-in)              |
| `src/logger/queue-base.ts`         | `AsyncLogQueueBase` (batch 100ms/50, max 10k)      |
| `src/logger/queue.ts`              | `AsyncLogQueue` (Node: unref'd timer, stderr fallback) |
| `src/logger/logger.ts`             | `LoggerImpl` implements `Logger`                   |
| `src/utils/date.ts`                | `formatTime`, `tzOffset`, `unixMs`, `unixSec`      |

## Log Levels

| Label | Numeric | Console     | CSS        |
| ----- | ------- | ----------- | ---------- |
| TRACE | 5       | dim         | `#666`     |
| DEBUG | 10      | gray        | `#888`     |
| INFO  | 20      | cyan        | `#06c`     |
| WARN  | 30      | yellow      | `#c90`     |
| ERROR | 40      | red         | `#c00` bold |
| FATAL | 50      | bold red    | `#900` bold |

`entry.level >= threshold` → emit. Threshold from `config.logging.level` (default `debug`), hot-applied via `setLevel`. `trace` is the lowest-verbosity debugging level; `fatal` is for unrecoverable/exiting paths.

## JSONL Format

```
level:number  timestamp:UnixSec  time:ISO8601+offset  message:string|object
module?:string  requestId?:string  userId?:string  sessionId?:string
error?:string  meta?:Record<string,unknown> (post-censor)
```

Time format: `YYYY-MM-DDTHH:MM:SS.sss±HH:MM`, parseable by `new Date()`, compatible with SQLite `strftime` and PostgreSQL `TO_CHAR`.

## Logger Interface

| Method | Notes |
| ------ | ----- |
| `trace/debug/info/warn(message, meta?)` | `message` is `string` or `Record<string, unknown>` |
| `error/fatal(message, error?, meta?)` | `error.stack ?? error.message` stored on `entry.error` |
| `child(bindings)` | Child with inherited bindings + shared level box |
| `addTransport(transport)` | Runtime add (e.g. `DBTransport` after DB init) |
| `setBindings(partial)` | Merge bindings at runtime |
| `setLevel(level)` | Retune this logger and its children, no restart |
| `flush()` | Drain queue + transport flush; rejects on transport flush failure |

## PII Censoring

Field-glob match (case-insensitive) on `meta`: `*key*`, `*token*`, `*secret*`, `*password*`, `*authorization*`, `*credential*`, `*cookie*`, `*session*`, `*bearer*`, `*auth*`, `email`, `ssn`, `phone`, `*api*key*`

Replacement: `[REDACTED]`. Applies to `meta` and to object-form `message`; string messages pass through. Recursive walk depth ≤ 5. Per-entry opt-out `skipCensor: true` exists on `LogOptions` but is not reachable through the `Logger` methods above.

## Entry Size Limits

Applied before queue:

| Field            | Default | Behavior          |
| ---------------- | ------- | ----------------- |
| message string   | 10 KB   | Truncate + suffix |
| meta total       | 100 KB  | Drop deepest keys |
| meta depth       | 5       | Hard cut          |
| error stack      | 5 KB    | Truncate + suffix |
| message obj keys | 100     | Strip excess      |
| meta entries     | 200     | Drop beyond       |

Config: `maxMessageBytes`, `maxMetaBytes`, `maxMetaDepth`, `maxStackBytes`, `queueMaxSize`.

## Async Queue

`LogEntry → AsyncLogQueue → [batch 100ms | 50 entries] → Transport[].write()`

Single consumer (`queueMicrotask` + `setInterval`; Node timer unref'd). `Promise.allSettled` transports. Fallback stderr on transport error. Overflow (10k): incoming entry dropped and counted, then one WARN `log queue full — dropped N entries` emitted on the next `enqueue` that finds the buffer empty.

## Shutdown

| Call | Effect |
| ---- | ------ |
| `logger.flush()` | Drains the queue, then `flush()` on every transport via `Promise.allSettled`; rejects with the first transport rejection |
| `queue.stop()` | Clears the 100ms timer |
| `queue.flushSync()` | Synchronous emergency path — drains the buffer straight to `process.stderr` as JSONL, no transports |

No `beforeExit`/`exit` flush hook: the queue timer is unref'd and `process.on("exit")` only kills subprocesses synchronously. Entries still buffered at exit are lost unless the caller awaits `flush()`.

`src/server/start.ts` is the shipped graceful path — SIGTERM/SIGINT/SIGHUP stop the scheduler, async store, servers, plugins and HTTP(S), then race `logger.flush()` against a 5s timeout (`[logger] flush timed out` → `process.exit(1)`; success → `process.exit(0)`). `uncaughtException`/`unhandledRejection` log `logger.fatal(...)` and run the same shutdown.

## Config — `src/config/sections/logging.ts`

| Field | Default | Env |
| ----- | ------- | --- |
| `level` | `debug` | `LOG_LEVEL` (hot-applied) |
| `jsonlPath`, `jsonlMaxBytes`, `jsonlMaxFiles` | unset | config file only — enables `FileTransport` |
| `dbEnabled` | unset | config file only — read by `src/server/start.ts`, which adds `DBTransport` when true |
| `censorEnabled`, `censorFields` | `true`, `[]` | config file only |
| `queueMaxSize` | 10 000 | config file only |
| `maxMessageBytes`, `maxMetaBytes`, `maxMetaDepth`, `maxStackBytes` | 10 KB / 100 KB / 5 / 5 KB | config file only |

Env mapping is generated from defaults (`src/config/schema-class/env-map.ts`), so only `LOG_LEVEL` exists — optional fields have no default and no env var. `logging.level` is the only hot-applicable logging path (`HOT_APPLY_PATHS`); the other fields are applied at startup only, and none appear in `REQUIRES_RESTART_KEYS`.

## Usage

```ts
import { createLogger, getLogger, } from "src/logger";

const log = createLogger(config.logging);
log.info("server started", { port: 3000 },);
const reqLog = log.child({ requestId: "abc", },);
reqLog.debug("handled",);
await getLogger().flush();
```

`getLogger()` throws until `createLogger()` has run.
