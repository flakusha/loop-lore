import { describe, expect, test, } from "bun:test";
import type { LogEntry, Transport, } from "../../logger/types";
import { AsyncLogQueue, } from "./queue";

/** Build a minimal log entry. */
function makeEntry(level = 20, message = "hello",): LogEntry {
  return {
    level,
    timestamp: 1_700_000_000,
    time: "20260704T143000.123+02:00",
    message,
    module: "test",
  };
}

/** Transport that records writes; optionally fails selected entries. */
function captureTransport(failOn?: (entry: LogEntry,) => boolean,): {
  transport: Transport;
  written: LogEntry[];
} {
  const written: LogEntry[] = [];
  return {
    written,
    transport: {
      name: "capture",
      async write(entry: LogEntry,) {
        if (failOn?.(entry,)) { throw new Error("transport down",); }
        written.push(entry,);
      },
      async flush() {},
    },
  };
}

describe("AsyncLogQueue", () => {
  test("flush delivers buffered entries to transports and drains the buffer", async () => {
    const { transport, written, } = captureTransport();
    const queue = new AsyncLogQueue([transport,],);
    queue.enqueue(makeEntry(20, "one",),);
    queue.enqueue(makeEntry(30, "two",),);
    await queue.flush();
    expect(written.map((e,) => e.message),).toEqual(["one", "two",],);
    // Second flush is a no-op on an empty buffer.
    await queue.flush();
    expect(written,).toHaveLength(2,);
  });

  test("start and stop manage the interval timer without firing before stop", () => {
    const { transport, written, } = captureTransport();
    const queue = new AsyncLogQueue([transport,], { flushInterval: 60_000, },);
    queue.start();
    queue.stop();
    expect(written,).toEqual([],);
  });

  test("flushSync is a browser no-op that does not write", () => {
    const { transport, written, } = captureTransport();
    const queue = new AsyncLogQueue([transport,],);
    queue.enqueue(makeEntry(),);
    queue.flushSync();
    expect(written,).toEqual([],);
  });

  test("a failing transport is reported via console.error fallback", async () => {
    const originalError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args,);
    };
    try {
      const failing = captureTransport(() => true);
      const healthy = captureTransport();
      const queue = new AsyncLogQueue([failing.transport, healthy.transport,],);
      queue.enqueue(makeEntry(20, "boom",),);
      await queue.flush();
      // Healthy transport still received the entry.
      expect(healthy.written.map((e,) => e.message),).toEqual(["boom",],);
      expect(failing.written,).toEqual([],);
      expect(errors.length,).toBeGreaterThan(0,);
      expect(String(errors[0]![0],),).toContain("transport write failed",);
    } finally {
      console.error = originalError;
    }
  });

  test("entries beyond the batch size drain via follow-up flushes", async () => {
    const { transport, written, } = captureTransport();
    const queue = new AsyncLogQueue([transport,], { batchSize: 2, },);
    for (const m of ["a", "b", "c", "d", "e",]) { queue.enqueue(makeEntry(20, m,),); }
    await queue.flush();
    // Follow-up flushes are scheduled on the microtask queue; yield once.
    await new Promise((resolve,) => setTimeout(resolve, 0,));
    expect(written.map((e,) => e.message),).toEqual(["a", "b", "c", "d", "e",],);
  });

  test("overflow drops oldest entries and surfaces a warning once space frees", async () => {
    const { transport, written, } = captureTransport();
    const queue = new AsyncLogQueue([transport,], { queueMaxSize: 2, },);
    for (const m of ["a", "b", "c", "d",]) { queue.enqueue(makeEntry(20, m,),); }
    await queue.flush();
    // "c" and "d" were dropped; the buffer held only "a" and "b".
    expect(written.map((e,) => e.message),).toEqual(["a", "b",],);
    // Next enqueue after a drop emits the queued-drop warning entry first.
    queue.enqueue(makeEntry(20, "fresh",),);
    await queue.flush();
    expect(written.map((e,) => e.message),).toEqual(["a", "b", expect.stringContaining("dropped 2",), "fresh",],);
  });
});
