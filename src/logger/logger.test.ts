// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import { LoggerImpl, } from "./logger";
import type { LogEntry, Transport, } from "./types";

class CapturingTransport implements Transport {
  readonly name = "capturing";
  readonly entries: LogEntry[] = [];

  write(entry: LogEntry,): Promise<void> {
    this.entries.push(entry,);
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}

describe("LoggerImpl message censoring", () => {
  let transport: CapturingTransport;
  let logger: LoggerImpl;

  beforeEach(() => {
    transport = new CapturingTransport();
    logger = new LoggerImpl({ level: "debug", censorFields: [], },);
    logger.addTransport(transport,);
  });

  test("structured message objects are censored", async () => {
    logger.info({ password: "s3cret", username: "alice", },);
    await logger.flush();

    expect(transport.entries).toHaveLength(1);
    const message = transport.entries[0]?.message as Record<string, unknown>;
    expect(message["username"],).toBe("alice");
    expect(String(message["password"],),).not.toContain("s3cret");
  });

  test("null message does not crash and passes through", async () => {
    logger.info(null,);
    await logger.flush();

    expect(transport.entries[0]?.message,).toBeNull();
  });

  test("string messages pass through uncensored", async () => {
    logger.info("hello world",);
    await logger.flush();

    expect(transport.entries[0]?.message,).toBe("hello world");
  });
});
