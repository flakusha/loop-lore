/**
 * Async log queue — batches entries and dispatches to transports.
 *
 * Design:
 *   LogEntry → AsyncQueue → [batch 100ms | 50 entries] → Transport[].write()
 *
 * Single consumer loop (microtask + setTimeout).
 * Transport writes parallelized via Promise.allSettled.
 * On transport failure: falls back to process.stderr.write.
 * Queue overflow: drops oldest entries, logs a warning entry.
 */

import type { LogEntry, Transport } from "./types";
import { unixSec, formatTime } from "../utils/date";
import { formatJSONL } from "./formatters";

const DEFAULT_FLUSH_INTERVAL = 100; // ms
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_QUEUE_MAX = 10_000;

interface QueueOptions {
  flushInterval?: number;
  batchSize?: number;
  queueMaxSize?: number;
}

export class AsyncLogQueue {
  private buffer: LogEntry[] = [];
  private transports: Transport[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private readonly flushInterval: number;
  private readonly batchSize: number;
  private readonly queueMaxSize: number;
  private droppedCount = 0;

  constructor(transports: Transport[], options?: QueueOptions) {
    this.transports = transports;
    this.flushInterval = options?.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    this.queueMaxSize = options?.queueMaxSize ?? DEFAULT_QUEUE_MAX;
  }

  /** Start the background flush timer. Safe to call multiple times. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushInterval);
    // Don't let the timer keep the process alive
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  /** Stop the background timer. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Enqueue a log entry for async dispatch. */
  enqueue(entry: LogEntry): void {
    if (this.buffer.length >= this.queueMaxSize) {
      this.droppedCount++;
      return;
    }

    // If we had dropped entries, log a warning when space opens up
    if (this.droppedCount > 0 && this.buffer.length === 0) {
      const warning: LogEntry = {
        level: 30,
        timestamp: unixSec(),
        time: formatTime(),
        message: `log queue full — dropped ${this.droppedCount} entries`,
        module: "logger",
      };
      this.buffer.push(warning);
      this.droppedCount = 0;
    }

    this.buffer.push(entry);

    // Flush immediately if batch size reached
    if (this.buffer.length >= this.batchSize) {
      // Schedule microtask flush — don't block the enqueue caller
      queueMicrotask(() => {
        void this.flush();
      });
    }
  }

  /** Flush all buffered entries to transports. Idempotent. */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;

    this.flushing = true;
    const batch = this.buffer.splice(0, this.batchSize);

    try {
      const results = await Promise.allSettled(
        this.transports.map((transport) => {
          return Promise.all(batch.map((logEntry) => transport.write(logEntry)));
        }),
      );

      // Log transport failures to stderr directly (cannot use logger — recursion)
      for (const result of results) {
        if (result.status !== "rejected") continue;

        const fallback: LogEntry = {
          level: 40,
          timestamp: unixSec(),
          time: formatTime(),
          message: "transport write failed",
          error: String(result.reason),
          module: "logger",
        };
        try {
          process.stderr.write(formatJSONL(fallback));
        } catch {
          // Last resort — swallow
        }
      }
    } finally {
      this.flushing = false;
    }

    // If more entries arrived while flushing, schedule another flush
    if (this.buffer.length > 0) {
      queueMicrotask(() => {
        void this.flush();
      });
    }
  }

  /** Sync fallback for emergency shutdown — writes directly to stderr. */
  flushSync(): void {
    const batch = [...this.buffer];
    this.buffer.length = 0;
    for (const entry of batch) {
      try {
        process.stderr.write(formatJSONL(entry));
      } catch {
        // Swallow
      }
    }
  }
}
