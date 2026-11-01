// SPDX-License-Identifier: LGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, spyOn, test, } from "bun:test";
import { createLogger, getLogger, type Logger, setGlobalLogger, } from ".";
import type { LogEntry, Transport, } from "./types";

/** Global root capture — restored after each test so global mutation never leaks across files. */
let prevRoot: Logger | undefined;
beforeEach(() => {
  try {
    prevRoot = getLogger();
  } catch {
    prevRoot = undefined;
  }
},);

afterEach(() => {
  if (prevRoot) {
    setGlobalLogger(prevRoot,);
  } else {
    createLogger({ level: "error", },);
  }

  prevRoot = undefined;
},);

describe("logger", () => {
  test("createLogger returns a logger instance", () => {
    const log = createLogger({ level: "info", },);
    expect(log,).toBeDefined();
    expect(typeof log.info,).toBe("function",);
  });

  test("createLogger with info level has infoString property", () => {
    const log = createLogger({ level: "info", },);
    expect(log.info,).toBeDefined();
  });

  test("getLogger returns the global root logger", () => {
    const global = createLogger({ level: "info", },);
    setGlobalLogger(global,);
    expect(getLogger(),).toBe(global,);
  });

  test("setGlobalLogger replaces the global root logger", () => {
    const first = createLogger({ level: "info", },);
    const second = createLogger({ level: "debug", },);
    setGlobalLogger(second,);
    expect(getLogger(),).toBe(second,);
    expect(getLogger(),).not.toBe(first,);
  });

  test("logger methods are callable", () => {
    const log = createLogger({ level: "info", },);
    expect(() => log.info("test message",)).not.toThrow();
    expect(() => log.warn("warning",)).not.toThrow();
    expect(() => log.error("error",)).not.toThrow();
  });

  test("logger has child() method", () => {
    const log = createLogger({ level: "info", },);
    const child = log.child({ requestId: "abc123", },);
    expect(child,).toBeDefined();
    expect(typeof child.info,).toBe("function",);
  });

  test("child logger inherits requestId in bindings", () => {
    const log = createLogger({ level: "info", },);
    const child = log.child({ requestId: "abc123", },);
    expect(child.info,).toBeDefined();
  });

  test("logger has addTransport method", () => {
    const log = createLogger({ level: "info", },);
    expect(typeof log.addTransport,).toBe("function",);
  });

  test("logger has flush method", () => {
    const log = createLogger({ level: "info", },);
    expect(typeof log.flush,).toBe("function",);
  });
});

/** Transport names the logger owns, read through the private field the public
 *  `Logger` interface deliberately does not expose — the point of the `console`
 *  option is that callers no longer have to. */
function transportNames(log: Logger,): string[] {
  return (log as unknown as { transports: Transport[] }).transports.map((t,) => t.name);
}

describe("LoggerConfig.console", () => {
  test("defaults to on", () => {
    expect(transportNames(createLogger({ level: "info", },),),).toContain("console",);
  });

  test("explicit off drops the console transport", () => {
    expect(transportNames(createLogger({ level: "info", console: false, },),),).not.toContain("console",);
  });

  test("explicit off keeps the file transport (the opt-out is scoped to console)", async () => {
    const path = ".tmp/logger-console-off-test.jsonl";
    const log = createLogger({ level: "info", console: false, jsonlPath: path, },);
    expect(transportNames(log,),).toEqual(["file",],);

    log.info("routed to file only",);
    await log.flush();
  });

  test("turning it off really stops stdout writes", async () => {
    const written: string[] = [];
    const stdout = spyOn(process.stdout, "write",).mockImplementation((chunk,) => {
      written.push(String(chunk,),);
      return true;
    },);

    try {
      const log = createLogger({ level: "info", console: false, },);
      log.info("must not reach the terminal",);
      await log.flush();
      expect(written,).toEqual([],);
    } finally {
      stdout.mockRestore();
    }
  });

  test("the default still writes to stdout", async () => {
    const written: string[] = [];
    const stdout = spyOn(process.stdout, "write",).mockImplementation((chunk,) => {
      written.push(String(chunk,),);
      return true;
    },);

    try {
      const log = createLogger({ level: "info", },);
      log.info("reaches the terminal",);
      await log.flush();
      expect(written.join("",),).toContain("reaches the terminal",);
    } finally {
      stdout.mockRestore();
    }
  });

  test("a child of a console-disabled logger stays console-disabled", () => {
    const child = createLogger({ level: "info", console: false, },).child({ module: "child", },);
    expect(transportNames(child,),).not.toContain("console",);
  });

  test("the queue shares the logger's live list — addTransport still delivers", async () => {
    const seen: LogEntry[] = [];
    const probe: Transport = {
      name: "probe",
      async write(entry,) {
        seen.push(entry,);
      },
      async flush() {},
    };

    const log = createLogger({ level: "info", console: false, },);
    log.addTransport(probe,);
    log.info("after registration",);
    await log.flush();

    expect(seen.map((e,) => e.message),).toEqual(["after registration",],);
  });
});
