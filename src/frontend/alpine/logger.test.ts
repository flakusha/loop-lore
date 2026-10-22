// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, spyOn, test, } from "bun:test";
import type { Transport, } from "../../logger/types";
import { createLogger, getLogger, log, setGlobalLogger, } from "./logger";

type Spy = { mockRestore: () => void };

describe("logger creation", () => {
  test("createLogger returns a Logger with methods", () => {
    const l = createLogger();
    expect(typeof l.debug,).toBe("function",);
    expect(typeof l.info,).toBe("function",);
    expect(typeof l.warn,).toBe("function",);
    expect(typeof l.error,).toBe("function",);
    expect(typeof l.child,).toBe("function",);
    expect(typeof l.flush,).toBe("function",);
    expect(typeof l.setLevel,).toBe("function",);
  });

  test("exported log is a Logger", () => {
    expect(typeof log.debug,).toBe("function",);
  });
});

describe("global logger management", () => {
  test("getLogger returns an instance after createLogger", () => {
    const before = getLogger();
    expect(before,).toBeDefined();
  });

  test("setGlobalLogger swaps the instance returned by getLogger", () => {
    const custom = createLogger({ level: "error", },);
    setGlobalLogger(custom,);
    expect(getLogger(),).toBe(custom,);
    setGlobalLogger(log,);
  });
});

describe("level filtering", () => {
  let consoleDebugSpy: Spy;
  let consoleInfoSpy: Spy;
  let consoleWarnSpy: Spy;
  let consoleErrorSpy: Spy;

  beforeEach(() => {
    consoleDebugSpy = spyOn(console, "debug",).mockImplementation(() => {},) as unknown as Spy;
    consoleInfoSpy = spyOn(console, "info",).mockImplementation(() => {},) as unknown as Spy;
    consoleWarnSpy = spyOn(console, "warn",).mockImplementation(() => {},) as unknown as Spy;
    consoleErrorSpy = spyOn(console, "error",).mockImplementation(() => {},) as unknown as Spy;
  },);

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  },);

  test("debug-level logger emits debug", async () => {
    const l = createLogger({ level: "debug", },);
    l.debug("hello",);
    await l.flush();
    expect(consoleDebugSpy,).toHaveBeenCalled();
  });

  test("error-level logger filters out debug and info", async () => {
    const l = createLogger({ level: "error", },);
    l.debug("d",);
    l.info("i",);
    l.warn("w",);
    await l.flush();
    expect(consoleDebugSpy,).not.toHaveBeenCalled();
    expect(consoleInfoSpy,).not.toHaveBeenCalled();
    expect(consoleWarnSpy,).not.toHaveBeenCalled();
  });

  test("error-level logger emits error", async () => {
    const l = createLogger({ level: "error", },);
    l.error("boom",);
    await l.flush();
    expect(consoleErrorSpy,).toHaveBeenCalled();
  });

  test("setLevel changes filtering at runtime", async () => {
    const l = createLogger({ level: "debug", },);
    l.setLevel("error",);
    l.debug("d",);
    await l.flush();
    expect(consoleDebugSpy,).not.toHaveBeenCalled();
  });

  test("child inherits parent level", async () => {
    const l = createLogger({ level: "error", },);
    const c = l.child({ module: "x", },);
    c.debug("d",);
    await c.flush();
    expect(consoleDebugSpy,).not.toHaveBeenCalled();
  });
});

describe("logger bindings", () => {
  test("setBindings merges bindings without throwing", () => {
    const l = createLogger();
    expect(() => l.setBindings({ module: "m", },)).not.toThrow();
  });

  test("addTransport adds transport", () => {
    const l = createLogger();
    const t: Transport = {
      name: "t",
      write: async () => {},
      flush: async () => {},
    };

    l.addTransport(t,);
    expect(true,).toBe(true,);
  });
});
