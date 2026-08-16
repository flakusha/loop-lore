// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

import { formatTime, unixSec, } from "../utils/date";
import { formatJSONL, } from "./formatters";
import { AsyncLogQueueBase, } from "./queue-base";
import type { LogEntry, } from "./types";

export class AsyncLogQueue extends AsyncLogQueueBase {
  override async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) { return; }

    this.flushing = true;
    try {
      await this.flushToTransports();
    } finally {
      this.flushing = false;
    }

    this.scheduleFollowupFlush();
  }

  protected handleTransportFailure(results: PromiseSettledResult<Awaited<void>[]>[],): void {
    for (const result of results) {
      if (result.status !== "rejected") { continue; }

      const fallback: LogEntry = {
        level: 40,
        timestamp: unixSec(),
        time: formatTime(),
        message: "transport write failed",
        error: String(result.reason,),
        module: "logger",
      };
      try {
        process.stderr.write(formatJSONL(fallback,),);
      } catch {
        // Last resort — swallow
      }
    }
  }

  protected override setupTimerUnref(): void {
    // Don't let the timer keep the process alive
    if (this.timer && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  /** Sync fallback for emergency shutdown — writes directly to stderr. */
  flushSync(): void {
    const batch = [...this.buffer,];
    this.buffer.length = 0;
    for (const entry of batch) {
      try {
        process.stderr.write(formatJSONL(entry,),);
      } catch {
        // Swallow
      }
    }
  }
}
