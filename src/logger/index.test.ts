// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { createLogger, getLogger, setGlobalLogger, } from "./index";

describe("logger index boundary", () => {
  test("getLogger throws before init", () => {
    expect(() => getLogger()).toThrow();
  });

  test("createLogger creates a logger", () => {
    const log = createLogger({ level: "info" });
    expect(log).toBeDefined();
  });

  test("createLogger assigns root so getLogger works", () => {
    createLogger({ level: "info" });
    const root = getLogger();
    expect(typeof root.info).toBe("function");
  });

  test("setGlobalLogger replaces root", () => {
    const log = createLogger({ level: "info" });
    setGlobalLogger(log);
    expect(getLogger()).toBe(log);
  });

  test("createLogger accepts partial config", () => {
    const log = createLogger({ level: "debug" });
    expect(log).toBeDefined();
  });

  test("export types are available", () => {
    expect(typeof createLogger).toBe("function");
    expect(typeof getLogger).toBe("function");
    expect(typeof setGlobalLogger).toBe("function");
  });
});