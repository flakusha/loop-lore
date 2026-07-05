# Logging

Unified structured logging. Zero deps. Async queue + PII censor + JSONL/DB transports (inactive until configured).

## Architecture

The logger module is organized into these source files:

1. **`src/utils/date.ts`** — `formatTime`, `tzOffset`, `unixMs`, `unixSec`
2. **`src/logger/index.ts`** — `createLogger`, `getLogger`, `setGlobalLogger`
3. **`src/logger/types.ts`** — `LogEntry`, `Logger`, `Transport`, `CensorRule`, `SizeLimits`
4. **`src/logger/levels.ts`** — `LogLevel` (Debug:10, Info:20, Warn:30, Error:40), `levelFromConfig`, `shouldEmit`
5. **`src/logger/formatters.ts`** — `formatConsole` (pretty+color), `formatJSONL`
6. **`src/logger/censors.ts`** — field-glob PII engine + `DEFAULT_RULES`
7. **`src/logger/limits.ts`** — entry size caps + truncation
8. **`src/logger/transports/console.ts`** — `ConsoleTransport` (always active)
9. **`src/logger/queue.ts`** — `AsyncLogQueue` (batch 100ms/50 entries, max 10k)
10. **`src/logger/logger.ts`** — `LoggerImpl` implements `Logger`

## JSONL Format

```
level:number   (10/20/30/40)
timestamp:UnixSec
time:ISO8601+offset  "2026-07-04T14:30:00.123+02:00"
message:string|object
module?:string
requestId?:string, userId?:string, sessionId?:string
error?:string
meta?:Record<string,unknown> (post-censor)
```

**Note on Date Format:**
The `time` field uses ISO 8601 format with timezone offset. This format is parseable by `new Date()` in JavaScript/TypeScript and compatible with both SQLite (`strftime`) and PostgreSQL (`TO_CHAR`).

- **Format:** `YYYY-MM-DDTHH:MM:SS.sss±HH:MM`
- **Milliseconds:** Always included (3 digits)
- **Timezone:** Offset from UTC (e.g., `+02:00`, `-05:00`, `+00:00`)
- **TZ Support:** Node.js respects the `TZ` environment variable by default. The `tzOffset()` function in `src/utils/date.ts` supports IANA timezone names via the `tz` parameter.

**SQLite Compatibility:**

```sql
-- Use this in migrations for ISO 8601 format:
datetime('now')  -- SQLite default: "YYYY-MM-DD HH:MM:SS" (space, no TZ)

-- For ISO 8601 with TZ, use strftime:
strftime('%Y-%m-%dT%H:%M:%f%z', 'now')  -- "2026-07-05T10:24:25.000+00:00"
```

**PostgreSQL Compatibility:**

```sql
-- PostgreSQL TIMESTAMP WITH TIME ZONE:
NOW()  -- "2026-07-05 10:24:25.123456+00"

-- For ISO 8601 output:
TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS.MS TZH:TZM')
```

**Format Precision:**

- Milliseconds: Always included (3 digits from JavaScript `Date`)
- Microseconds/Nanoseconds: Not available in JavaScript `Date` object. For higher precision, use `performance.now()` or store as separate integer field.

## Log Levels

| Label | Numeric | Console color |
| ----- | ------- | ------------- |
| DEBUG | 10      | gray          |
| INFO  | 20      | cyan          |
| WARN  | 30      | yellow        |
| ERROR | 40      | red           |

`entry.level >= threshold` → emit. Threshold from `config.logging.level`.

## Logger Interface

```typescript
interface Logger {
  debug(msg, meta?): void;
  info(msg, meta?): void;
  warn(msg, meta?): void;
  error(msg, err?, meta?): void;
  child(bindings: { module?; requestId?; userId?; sessionId? }): Logger;
  flush(): Promise<void>;
}
```

## PII Censoring

Field-glob match (case-insensitive) on `meta` before dispatch:
`*key*`, `*token*`, `*secret*`, `*password*`, `*authorization*`, `*credential*`, `email`, `ssn`, `phone`, `*api*key*`

Replacement: `[REDACTED]`. Per-entry opt-out: `skipCensor: true` in `LogOptions`.

Algorithm: recursive walk depth ≤ 5, key match → replace. Nested objects recurse. Arrays apply per-element.

## Entry Size Limits

Applied at Logger.log() before queue:

| Field               | Default | Behavior          |
| ------------------- | ------- | ----------------- |
| message string      | 10 KB   | Truncate + suffix |
| meta total          | 100 KB  | Drop deepest keys |
| meta depth          | 5       | Hard cut          |
| error stack         | 5 KB    | Truncate + suffix |
| message object keys | 100     | Strip excess      |
| meta entries        | 200     | Drop beyond       |

Config: `maxMessageBytes`, `maxMetaBytes`, `maxMetaDepth`, `maxStackBytes`, `queueMaxSize`.

## Async Queue

`LogEntry → AsyncLogQueue → [batch 100ms | 50 entries] → Transport[].write()`

Single consumer (queueMicrotask + setInterval). Promise.allSettled transports. Fallback stderr on transport error.

Queue overflow (default 10k): drop oldest. Warning entry emitted when space opens.

## Shutdown

```typescript
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
// rootLogger.flush() await with 5s timeout, then process.exit
```

## Config Schema (src/config/schema.ts)

```typescript
interface LoggingConfig {
  level: LogLevelT;
  jsonlPath?: string; // JSONL output path
  jsonlMaxBytes?: number; // default 100 MB
  jsonlMaxFiles?: number; // default 5
  dbEnabled?: boolean;
  censorEnabled?: boolean;
  censorFields?: string[];
  queueMaxSize?: number;
  maxMessageBytes?: number;
  maxMetaBytes?: number;
  maxMetaDepth?: number;
  maxStackBytes?: number;
}
```

Env overrides: `LOG_LEVEL`, `LOG_JSONL_PATH`, `LOG_DB_ENABLED`, `LOG_CENSOR_ENABLED`.

## Usage

```typescript
import { createLogger, getLogger } from "./logger";

// Init (server start):
createLogger(config.logging);

// Anywhere:
getLogger().info("server started");
const reqLog = getLogger().child({ module: "http", requestId });
reqLog.info("handling request");

// Error:
getLogger().error("db query failed", err);
```
