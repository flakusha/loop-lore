/**
 * Browser AsyncLogQueue — port of src/logger/queue.ts without Node deps.
 *
 * Batches entries → transports on 100ms interval / 50 entry batch.
 * Queue overflow: drops oldest. Fallback: console.error on transport failure.
 */

import type { LogEntry, Transport } from "../../logger/types";
import { unixSec, formatTime } from "../../utils/date";

const DEFAULT_FLUSH_INTERVAL = 100;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_QUEUE_MAX = 10_000;

export class AsyncLogQueue {
  private buffer: LogEntry[] = [];
  private transports: Transport[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private readonly flushInterval: number;
  private readonly batchSize: number;
  private readonly queueMaxSize: number;
  private droppedCount = 0;

  constructor(
    transports: Transport[],
    options?: { flushInterval?: number; batchSize?: number; queueMaxSize?: number },
  ) {
    this.transports = transports;
    this.flushInterval = options?.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    this.queueMaxSize = options?.queueMaxSize ?? DEFAULT_QUEUE_MAX;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushInterval);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  enqueue(entry: LogEntry): void {
    if (this.buffer.length >= this.queueMaxSize) {
      this.droppedCount++;
      return;
    }

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

    if (this.buffer.length >= this.batchSize) {
      queueMicrotask(() => {
        void this.flush();
      });
    }
  }

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

      for (const result of results) {
        if (result.status !== "rejected") continue;
        try {
          console.error("[logger] transport write failed:", result.reason);
        } catch {
          // Last resort — swallow
        }
      }
    } finally {
      this.flushing = false;
    }

    if (this.buffer.length > 0) {
      queueMicrotask(() => {
        void this.flush();
      });
    }
  }
}
