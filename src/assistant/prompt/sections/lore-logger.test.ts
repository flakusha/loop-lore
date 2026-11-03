// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Contract test for the lore inclusion-group logger.
 *
 * Resource contract: the module only touches the global root logger, so the
 * test swaps in a recording stub via `setGlobalLogger` and restores the prior
 * root in a `finally` — no database, file or port is involved.
 */
import { describe, expect, test, } from "bun:test";
import { getLogger, setGlobalLogger, } from "../../../logger";
import type { Logger, } from "../../../logger";
import { logGroupAdmissions, loreLogger, } from "./lore-logger";

/** One recorded debug call. */
interface RecordedCall {
  message: string;
  meta?: Record<string, unknown>;
}

/** A logger stub that records every debug call it receives. */
function recordingLogger(calls: RecordedCall[],): Logger {
  const logger: Logger = {
    trace: () => {},
    debug: (message: string | Record<string, unknown>, meta?: Record<string, unknown>,) => {
      calls.push({ message: String(message,), meta, },);
    },
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => logger,
    addTransport: () => {},
    setBindings: () => {},
    setLevel: () => {},
    flush: () => Promise.resolve(),
  };

  return logger;
}

/** Run `body` with the given root installed, restoring the prior root after. */
function withRoot(root: Logger | undefined, body: () => void,): void {
  let prior: Logger | null = null;
  try {
    prior = getLogger();
  } catch {
    prior = null;
  }

  setGlobalLogger(root as Logger,);
  try {
    body();
  } finally {
    setGlobalLogger(prior as Logger,);
  }
}

describe("loreLogger", () => {
  test("returns the child logger of the installed root", () => {
    withRoot(recordingLogger([],), () => {
      expect(loreLogger(),).not.toBeNull();
    },);
  });

  test("returns null when no root logger is installed", () => {
    withRoot(undefined, () => {
      expect(loreLogger(),).toBeNull();
    },);
  });
});

describe("logGroupAdmissions", () => {
  test("logs one debug line per group with the winner and the skipped ids", () => {
    const calls: RecordedCall[] = [];
    withRoot(recordingLogger(calls,), () => {
      logGroupAdmissions([{ group: "secrets", winner_id: "w-1", skipped_ids: ["s-1", "s-2",], },],);
    },);

    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.message,).toBe("lore inclusion group admission",);
    expect(calls[0]?.meta,).toEqual({ group: "secrets", winner_id: "w-1", skipped_ids: ["s-1", "s-2",], },);
  });

  test("does nothing when no root logger is installed", () => {
    withRoot(undefined, () => {
      expect(() => logGroupAdmissions([{ group: "secrets", winner_id: "w-1", skipped_ids: [], },],)).not.toThrow();
    },);
  });
});
