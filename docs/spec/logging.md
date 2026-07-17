# Logging

Unified structured logging. Zero deps. Async queue + PII censor + JSONL/DB transports.

## Source Files

| File                               | Purpose                                           |
| ---------------------------------- | ------------------------------------------------- |
| `src/logger/index.ts`              | `createLogger`, `getLogger`                       |
| `src/logger/types.ts`              | `LogEntry`, `Logger`, `Transport`                 |
| `src/logger/levels.ts`             | `LogLevel` (Debug:10, Info:20, Warn:30, Error:40) |
| `src/logger/formatters.ts`         | `formatConsole`, `formatJSONL`                    |
| `src/logger/censors.ts`            | Field-glob PII engine + `DEFAULT_RULES`           |
| `src/logger/limits.ts`             | Entry size caps + truncation                      |
| `src/logger/transports/console.ts` | `ConsoleTransport` (always active)                |
| `src/logger/queue.ts`              | `AsyncLogQueue` (batch 100ms/50 entries, max 10k) |
| `src/logger/logger.ts`             | `LoggerImpl` implements `Logger`                  |
| `src/utils/date.ts`                | `formatTime`, `tzOffset`, `unixMs`                |

## Log Levels

| Label | Numeric | Console |
| ----- | ------- | ------- |
| DEBUG | 10      | gray    |
| INFO  | 20      | cyan    |
| WARN  | 30      | yellow  |
| ERROR | 40      | red     |

`entry.level >= threshold` → emit. Threshold from `config.logging.level`.

## JSONL Format

```
level:number  timestamp:UnixSec  time:ISO8601+offset  message:string|object
module?:string  requestId?:string  userId?:string  sessionId?:string
error?:string  meta?:Record<string,unknown> (post-censor)
```

Time format: `YYYY-MM-DDTHH:MM:SS.sss±HH:MM`, parseable by `new Date()`, compatible with SQLite `strftime` and PostgreSQL `TO_CHAR`.

## Logger Interface

## PII Censoring

Field-glob match (case-insensitive) on `meta`: `*key*`, `*token*`, `*secret*`, `*password*`, `*authorization*`, `*credential*`, `email`, `ssn`, `phone`, `*api*key*`

Replacement: `[REDACTED]`. Per-entry opt-out: `skipCensor: true`. Recursive walk depth ≤ 5.

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

Single consumer (`queueMicrotask` + `setInterval`). `Promise.allSettled` transports. Fallback stderr on transport error. Overflow (10k): drop oldest, warn on space open.

## Shutdown

## Config — `src/config/schema.ts`

Env: `LOG_LEVEL`, `LOG_JSONL_PATH`, `LOG_DB_ENABLED`, `LOG_CENSOR_ENABLED`.

## Usage
