// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ServerTransport — POSTs log entries to /api/frontend/logs.
 *
 * Batches entries on a 5s interval. Browser auth rides the HttpOnly
 * `ll_token` cookie (same-origin, automatic); the route is public and the
 * request carries only the CSRF double-submit header when present.
 */

import type { LogEntry, Transport, } from "../../../logger/types";
import { safeFetch, } from "../../../utils";
import { getCsrfToken, } from "../../fe-fetch";

/** */
export class ServerTransport implements Transport {
  readonly name = "server";
  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param entry
   */
  write(entry: LogEntry,): Promise<void> {
    this.buffer.push(entry,);
    this.scheduleFlush();
    return Promise.resolve();
  }

  /** */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer,);
      this.timer = null;
    }
    if (this.buffer.length === 0) { return; }

    const batch = this.buffer.slice();
    this.buffer.length = 0;

    try {
      const csrf = getCsrfToken();
      await safeFetch("/api/frontend/logs", {
        method: "POST",
        body: { entries: batch, },
        auth: { csrfToken: csrf || undefined, },
        handle401: false,
        timeout: 10_000,
      },);
      // Fire-and-forget — errors are silently discarded
    } catch {
      // Server unreachable — discard batch
    }
  }

  /** */
  private scheduleFlush(): void {
    if (this.timer) { return; }
    this.timer = setTimeout(() => {
      this.timer = null;
      void (async () => {
        try {
          await this.flush();
        } catch {
          /* transport flush — non-critical */
        }
      })();
    }, 5000,);
  }
}
