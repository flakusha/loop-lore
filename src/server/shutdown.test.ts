// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression for the `start.ts` shutdown extraction: registration stays a
 * pure wiring step. `process.on` is stubbed so no signal or exit handler runs.
 */
import { describe, expect, test, } from "bun:test";
import { registerShutdownHandlers, } from "./shutdown";

describe("registerShutdownHandlers", () => {
  test("registers exit and signal handlers without invoking them", () => {
    const events: string[] = [];
    const originalOn = process.on;
    const recordingOn = ((event: string,) => {
      events.push(event,);
      return process;
    }) as typeof process.on;

    (process as unknown as { on: typeof process.on }).on = recordingOn;

    try {
      registerShutdownHandlers({
        domainConfigWatcher: undefined,
        backgroundServices: { stop: () => {}, },
        serverManager: { stopAll: async () => {}, killAllSync: () => {}, },
        stdioProxy: undefined,
        httpServer: { stop: () => {}, },
        httpsServer: undefined,
        logger: { flush: async () => {}, fatal: () => {}, } as never,
      },);
    } finally {
      (process as unknown as { on: typeof process.on }).on = originalOn;
    }

    expect(events,).toContain("exit",);
    expect(events,).toContain("SIGTERM",);
    expect(events,).toContain("SIGINT",);
    expect(events,).toContain("uncaughtException",);
    expect(events,).toContain("unhandledRejection",);
  });
});
