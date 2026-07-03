# Logging

Unified structured logging. Zero deps. Async queue + PII censor + JSONL/DB transports (inactive until configured).

## Architecture

```
src/utils/date.ts        — formatTime, tzOffset, unixMs, unixSec
src/logger/
  index.ts               — createLogger, getLogger, setGlobalLogger
  types.ts               — LogEntry, Logger, Transport, CensorRule, SizeLimits
  levels.ts              — LogLevel (Debug:10, Info:20, Warn:30, Error:40), levelFromConfig, shouldEmit
  formatters.ts          — formatConsole (pretty+color), formatJSONL
  censors.ts             — field-glob PII engine + DEFAULT_RULES
  limits.ts              — entry size caps + truncation
  transports/console.ts  — ConsoleTransport (always active)
  queue.ts               — AsyncLogQueue (batch 100ms/50 entries, max 10k)
  logger.ts              — LoggerImpl implements Logger
```

## JSONL Format

```
level:number   (10/20/30/40)
timestamp:UnixSec
time:compactISO+offset  "20260704T143000.123+02:00"
message:string|object
module?:string
requestId?:string, userId?:string, sessionId?:string
error?:string
meta?:Record<string,unknown> (post-censor)
```

## Log Levels

| Label | Numeric | Console color |
|-------|---------|---------------|
| DEBUG | 10 | gray |
| INFO  | 20 | cyan |
| WARN  | 30 | yellow |
| ERROR | 40 | red |

`entry.level >= threshold` → emit. Threshold from `config.logging.level`.

## Logger Interface

```typescript
interface Logger {
  debug(msg, meta?): void;
  info(msg, meta?): void;
  warn(msg, meta?): void;
  error(msg, err?, meta?): void;
  child(bindings: { module?, requestId?, userId?, sessionId? }): Logger;
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

| Field | Default | Behavior |
|-------|---------|----------|
| message string | 10 KB | Truncate + suffix |
| meta total | 100 KB | Drop deepest keys |
| meta depth | 5 | Hard cut |
| error stack | 5 KB | Truncate + suffix |
| message object keys | 100 | Strip excess |
| meta entries | 200 | Drop beyond |

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
  jsonlPath?: string;        // JSONL output path
  jsonlMaxBytes?: number;    // default 100 MB
  jsonlMaxFiles?: number;    // default 5
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
