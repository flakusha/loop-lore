// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser AsyncLogQueue — port of src/logger/queue.ts without Node deps.
 *
 * Batches entries → dispatches to transports on 100ms interval / 50 entry batch.
 * Queue overflow: drops oldest. Fallback: console.error on transport failure.
 */

import { AsyncLogQueueBase, } from "../../logger/queue-base";

/** */
export class AsyncLogQueue extends AsyncLogQueueBase {
  /** */
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

  /**
   * @param results
   */
  protected override handleTransportFailure(results: PromiseSettledResult<Awaited<void>[]>[],): void {
    for (const result of results) {
      if (result.status !== "rejected") { continue; }
      try {
        console.error("[logger] transport write failed:", result.reason,);
      } catch {
        // Last resort — swallow
      }
    }
  }

  /** */
  protected override setupTimerUnref(): void {
    // No-op in browser
  }

  /** */
  flushSync(): void {
    // No-op in browser — not supported
  }
}
