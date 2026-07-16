/**
 * AsyncLogQueueBase — shared logic for Node and browser log queues.
 *
 * Batches entries → dispatches to transports on 100ms interval / 50 entry batch.
 */

import type { LogEntry, Transport } from "./types";
import { unixSec, formatTime } from "../utils/date";

export const DEFAULT_FLUSH_INTERVAL = 100;
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_QUEUE_MAX = 10_000;

export interface QueueOptions {
  flushInterval?: number;
  batchSize?: number;
  queueMaxSize?: number;
}

export abstract class AsyncLogQueueBase {
  protected buffer: LogEntry[] = [];
  protected transports: Transport[] = [];
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected flushing = false;
  protected readonly flushInterval: number;
  protected readonly batchSize: number;
  protected readonly queueMaxSize: number;
  protected droppedCount = 0;

  constructor(transports: Transport[], options?: QueueOptions) {
    this.transports = transports;
    this.flushInterval = options?.flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    this.batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    this.queueMaxSize = options?.queueMaxSize ?? DEFAULT_QUEUE_MAX;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void (async () => {
        try {
          await this.flush();
        } catch {
          // timer flush — non-critical
        }
      })();
    }, this.flushInterval);
    // Subclass may override: timer.unref() for Node
    this.setupTimerUnref();
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
      queueMicrotask(() => {
        void (async () => {
          try {
            await this.flush();
          } catch {
            // microtask flush — non-critical
          }
        })();
      });
    }
  }

  abstract flush(): Promise<void>;

  protected async flushToTransports(): Promise<void> {
    const batch = this.buffer.splice(0, this.batchSize);

    const results = await Promise.allSettled(
      this.transports.map((transport) => {
        return Promise.all(batch.map((logEntry) => transport.write(logEntry)));
      }),
    );

    // Subclass implements fallback (process.stderr.write or console.error)
    this.handleTransportFailure(results);
  }

  protected abstract handleTransportFailure(results: PromiseSettledResult<Awaited<void>[]>[]): void;

  protected abstract setupTimerUnref(): void;

  protected scheduleFollowupFlush(): void {
    if (this.buffer.length > 0) {
      queueMicrotask(() => {
        void (async () => {
          try {
            await this.flush();
          } catch {
            // follow-up flush — non-critical
          }
        })();
      });
    }
  }

  abstract flushSync(): void;
}
