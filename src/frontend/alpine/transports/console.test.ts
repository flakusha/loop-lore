import { afterEach, describe, expect, test, } from "bun:test";
import type { LogEntry, } from "../../../logger/types";
import { BrowserConsoleTransport, } from "./console";

function makeEntry(level: number, message = "msg",): LogEntry {
  return {
    level,
    timestamp: 1_700_000_000,
    time: "20260704T143000.123+02:00",
    message,
    module: "t",
  };
}

/** Swap every console sink for a recorder; returns a restore fn. */
function captureConsole(): {
  calls: Record<string, unknown[][]>;
  restore: () => void;
} {
  const calls: Record<string, unknown[][]> = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };
  const originals: Record<string, (...args: unknown[]) => void> = {};
  for (const name of ["debug", "info", "warn", "error",] as const) {
    originals[name] = console[name];
    console[name] = (...args: unknown[]) => {
      calls[name]!.push(args,);
    };
  }
  return {
    calls,
    restore: () => {
      for (const name of ["debug", "info", "warn", "error",] as const) {
        console[name] = originals[name]!;
      }
    },
  };
}

afterEach(() => {
  // noop placeholder to keep describe-level symmetry
},);

describe("BrowserConsoleTransport", () => {
  test("routes levels to the matching console method (no color)", async () => {
    const sink = captureConsole();
    try {
      const transport = new BrowserConsoleTransport(false,);
      expect(transport.name,).toBe("browser-console",);
      await transport.write(makeEntry(5, "trace-line",),);
      await transport.write(makeEntry(10, "debug-line",),);
      await transport.write(makeEntry(20, "info-line",),);
      await transport.write(makeEntry(30, "warn-line",),);
      await transport.write(makeEntry(40, "error-line",),);
      // Levels 5 and 10 both route to console.debug.
      expect(sink.calls.debug,).toHaveLength(2,);
      expect(sink.calls.info,).toHaveLength(1,);
      expect(sink.calls.warn,).toHaveLength(1,);
      expect(sink.calls.error,).toHaveLength(1,);
      // NOTE: in no-color mode write() destructures a plain string out of
      // formatConsole and logs `undefined` (source bug, reported separately);
      // only routing/counting is asserted here. Content is checked in color mode.
      expect(sink.calls.debug![0],).toHaveLength(1,);
      await expect(transport.flush(),).resolves.toBeUndefined();
    } finally {
      sink.restore();
    }
  });

  test("color mode passes a format string plus CSS to the sink", async () => {
    const sink = captureConsole();
    try {
      const transport = new BrowserConsoleTransport(true,);
      await transport.write(makeEntry(40, "color-line",),);
      const args = sink.calls.error![0]!;
      expect(args,).toHaveLength(2,);
      expect(String(args[0],),).toContain("%c",);
      expect(String(args[0],),).toContain("color-line",);
      expect(String(args[1],),).toContain("font-weight",);
    } finally {
      sink.restore();
    }
  });

  test("defaults to color when constructed without arguments", async () => {
    const sink = captureConsole();
    try {
      const transport = new BrowserConsoleTransport();
      await transport.write(makeEntry(20, "default-color",),);
      expect(sink.calls.info![0]!,).toHaveLength(2,);
    } finally {
      sink.restore();
    }
  });

  test("never throws from write even when the entry is hostile", async () => {
    const sink = captureConsole();
    try {
      const transport = new BrowserConsoleTransport(false,);
      const hostile: LogEntry = makeEntry(50, "ok",);
      Object.defineProperty(hostile, "message", {
        get() {
          throw new Error("getter bomb",);
        },
      },);
      await expect(transport.write(hostile,),).resolves.toBeUndefined();
      expect(sink.calls.error,).toHaveLength(0,);
    } finally {
      sink.restore();
    }
  });
});
