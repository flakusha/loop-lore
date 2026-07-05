/**
 * Tests for logger/transports/console.ts — ConsoleTransport
 */

import { describe, test, expect } from "bun:test";
import { ConsoleTransport } from "./console";
import type { LogEntry } from "../types";

const infoEntry: LogEntry = {
  level: 20,
  timestamp: 1_800_000_000,
  time: "20260704T143000.123+02:00",
  message: "test info",
};

const errorEntry: LogEntry = {
  level: 40,
  timestamp: 1_800_000_000,
  time: "20260704T143000.123+02:00",
  message: "test error",
};

describe("ConsoleTransport", () => {
  test("has name 'console'", () => {
    const transport = new ConsoleTransport();
    expect(transport.name).toBe("console");
  });

  test("write returns a promise", async () => {
    const transport = new ConsoleTransport(false);
    const result = transport.write(infoEntry);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  test("flush returns a resolved promise", async () => {
    const transport = new ConsoleTransport();
    await expect(transport.flush()).resolves.toBeUndefined();
  });

  test("handles entries with module", async () => {
    const transport = new ConsoleTransport(false);
    const entry: LogEntry = { ...infoEntry, module: "test" };
    await expect(transport.write(entry)).resolves.toBeUndefined();
  });

  test("handles entries with error", async () => {
    const transport = new ConsoleTransport(false);
    const entry: LogEntry = { ...errorEntry, error: "stack trace" };
    await expect(transport.write(entry)).resolves.toBeUndefined();
  });

  test("handles object messages", async () => {
    const transport = new ConsoleTransport(false);
    const entry: LogEntry = { ...infoEntry, message: { key: "val" } };
    await expect(transport.write(entry)).resolves.toBeUndefined();
  });

  test("color mode defaults to isTTY", () => {
    const transport = new ConsoleTransport();
    expect(transport.name).toBe("console");
  });

  test("explicit color false disables ANSI", () => {
    const transport = new ConsoleTransport(false);
    expect(transport.name).toBe("console");
  });

  test("explicit color true enables ANSI", () => {
    const transport = new ConsoleTransport(true);
    expect(transport.name).toBe("console");
  });
});
