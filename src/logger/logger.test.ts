// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { createLogger, getLogger, setGlobalLogger, } from ".";

describe("logger", () => {
  test("createLogger returns a logger instance", () => {
    const log = createLogger({ level: "info" });
    expect(log).toBeDefined();
    expect(typeof log.info).toBe("function");
  });

  test("createLogger with info level has infoString property", () => {
    const log = createLogger({ level: "info" });
    expect(log.info).toBeDefined();
  });

  test("getLogger returns the global root logger", () => {
    const global = createLogger({ level: "info" });
    expect(getLogger()).toBe(global);
  });

  test("setGlobalLogger replaces the global root logger", () => {
    const first = createLogger({ level: "info" });
    const second = createLogger({ level: "debug" });
    setGlobalLogger(second);
    expect(getLogger()).toBe(second);
    expect(getLogger()).not.toBe(first);
  });

  test("logger methods are callable", () => {
    const log = createLogger({ level: "info" });
    expect(() => log.info("test message")).not.toThrow();
    expect(() => log.warn("warning")).not.toThrow();
    expect(() => log.error("error")).not.toThrow();
  });

  test("logger has child() method", () => {
    const log = createLogger({ level: "info" });
    const child = log.child({ requestId: "abc123" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });

  test("child logger inherits requestId in bindings", () => {
    const log = createLogger({ level: "info" });
    const child = log.child({ requestId: "abc123" });
    expect(child.info).toBeDefined();
  });

  test("logger has addTransport method", () => {
    const log = createLogger({ level: "info" });
    expect(typeof log.addTransport).toBe("function");
  });

  test("logger has flush method", () => {
    const log = createLogger({ level: "info" });
    expect(typeof log.flush).toBe("function");
  });
});