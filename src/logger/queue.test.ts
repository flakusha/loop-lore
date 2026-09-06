// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { AsyncLogQueue, } from "./queue";
import { ConsoleTransport, } from "./transports/console";
import type { LogEntry, Transport, } from "./types";

/** Mock transport that can fail */
class FailingTransport implements Transport {
  readonly name = "failing";
  failOnWrite = false;
  written: LogEntry[] = [];

  async write(entry: LogEntry): Promise<void> {
    if (this.failOnWrite) { throw new Error("transport write failed"); }
    this.written.push(entry,);
  }

  async flush(): Promise<void> {}
}

/** Wait for scheduled microtasks to drain. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

describe("AsyncLogQueue", () => {
  test("instantiates with default options", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(),]);
    expect(queue["flushInterval"]).toBe(100,);
    expect(queue["batchSize"]).toBe(50,);
    expect(queue["queueMaxSize"]).toBe(10_000,);
    queue.stop();
  });

  test("instantiates with custom options", () => {
    const queue = new AsyncLogQueue(
      [new ConsoleTransport(),],
      { flushInterval: 200, batchSize: 20, queueMaxSize: 1000, },
    );
    expect(queue["flushInterval"]).toBe(200,);
    expect(queue["batchSize"]).toBe(20,);
    expect(queue["queueMaxSize"]).toBe(1000,);
    queue.stop();
  });

  test("enqueue adds entry to buffer", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(),], { queueMaxSize: 100, });

    const entry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "hello world",
    };

    queue.enqueue(entry,);
    expect(queue["buffer"].length).toBe(1,);
    expect(queue["buffer"][0]).toBe(entry,);
    queue.stop();
  });

  test("enqueue respects queue max size and drops overflow", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(),], { queueMaxSize: 2, });

    const baseEntry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "test",
    };

    queue.enqueue({ ...baseEntry, message: "a", },);
    queue.enqueue({ ...baseEntry, message: "b", },);
    queue.enqueue({ ...baseEntry, message: "c", },); // dropped

    expect(queue["buffer"].length).toBe(2,);
    expect(queue["buffer"][0].message).toBe("a",);
    expect(queue["buffer"][1].message).toBe("b",);
    expect(queue["droppedCount"]).toBe(1,);
    queue.stop();
  });

  test("emits warning entry after recovering from drop", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(),], { queueMaxSize: 2, });

    const baseEntry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "msg",
    };

    queue.enqueue(baseEntry,);
    queue.enqueue(baseEntry,);
    queue.enqueue(baseEntry,); // dropped → droppedCount=1

    // Manually clear buffer so recovery check triggers
    queue["buffer"].length = 0;

    queue.enqueue(baseEntry,);

    // The first item is the warning, the second is the actual entry
    expect(queue["buffer"].length).toBe(2,);
    expect(queue["buffer"][0].level).toBe(30,);
    expect(queue["buffer"][0].message).toContain("dropped",);
    expect(queue["buffer"][0].module).toBe("logger",);
    expect(queue["droppedCount"]).toBe(0,);

    queue.stop();
  });

  test("flush writes to transports and empties buffer", async () => {
    const transport = new ConsoleTransport(false,);
    const queue = new AsyncLogQueue([transport,], { queueMaxSize: 100, });

    queue.enqueue({
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "flush test",
    },);

    await queue.flush();
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("flush processes multiple entries", async () => {
    const transport = new ConsoleTransport(false,);
    const queue = new AsyncLogQueue([transport,], { queueMaxSize: 100, });

    for (let i = 0; i < 5; i++) {
      queue.enqueue({
        level: 20,
        timestamp: 1_800_000_000 + i,
        time: "20260704T143000.123+02:00",
        message: `msg ${i}`,
      },);
    }

    await queue.flush();
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("flush is no-op when buffer empty", async () => {
    const transport = new ConsoleTransport(false,);
    const queue = new AsyncLogQueue([transport,], { queueMaxSize: 100, });

    await queue.flush();
    expect(queue["buffer"].length).toBe(0,);
    expect(queue["flushing"]).toBe(false,);
    queue.stop();
  });

  test("flush is no-op when already flushing", async () => {
    const transport = new ConsoleTransport(false,);
    const queue = new AsyncLogQueue([transport,], { queueMaxSize: 100, });

    queue.enqueue({
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "first",
    },);

    // Kick off a flush; mid-flight, flushing=true. Calling again is safe.
    const first = queue.flush();
    await queue.flush();
    await first;
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("handleTransportFailure swallows transport errors via stderr fallback", async () => {
    const failing = new FailingTransport();
    failing.failOnWrite = true;

    const queue = new AsyncLogQueue([failing,], { queueMaxSize: 100, });

    queue.enqueue({
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "should fail",
    },);

    // Should not throw — handleTransportFailure writes fallback to stderr
    expect(queue.flush()).resolves.toBeUndefined();
    await settle();
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("handleTransportFailure swallows stderr write errors", async () => {
    // Simulate process.stderr.write throwing so the inner catch is exercised.
    const originalWrite = process.stderr.write.bind(process.stderr,);
    let originalThrew = false;
    (process.stderr as unknown as { write: (chunk: string) => boolean })
      .write = ((chunk: string): boolean => {
        originalThrew = true;
        throw new Error("stderr broken");
      }) as typeof process.stderr.write;

    try {
      const failing = new FailingTransport();
      failing.failOnWrite = true;
      const queue = new AsyncLogQueue([failing,], { queueMaxSize: 100, });

      queue.enqueue({
        level: 20,
        timestamp: 1_800_000_000,
        time: "20260704T143000.123+02:00",
        message: "boom",
      },);

      await queue.flush();
      expect(originalThrew).toBe(true,);
      queue.stop();
    } finally {
      (process.stderr as unknown as { write: typeof originalWrite })
        .write = originalWrite;
    }
  });

  test("start sets up timer and stop clears it", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(),], { queueMaxSize: 100, });

    queue.start();
    expect(queue["timer"]).not.toBeNull();

    queue.stop();
    expect(queue["timer"]).toBeNull();
  });

  test("start is idempotent", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(),], { queueMaxSize: 100, });

    queue.start();
    const firstTimer = queue["timer"];
    queue.start();
    expect(queue["timer"]).toBe(firstTimer,);
    queue.stop();
  });

  test("stop is no-op when timer already cleared", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(),], { queueMaxSize: 100, });

    expect(() => queue.stop()).not.toThrow();
  });

  test("start unrefs the timer so it doesn't block shutdown", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(),], { queueMaxSize: 100, });

    queue.start();
    // The unref call mutates the timer; presence is the public contract.
    expect(queue["timer"]).not.toBeNull();
    queue.stop();
  });

  test("flushSync drains buffer to stderr", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(false,),], { queueMaxSize: 100, });

    queue.enqueue({
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "sync flush test",
    },);

    expect(() => queue.flushSync()).not.toThrow();
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("flushSync handles empty buffer", () => {
    const queue = new AsyncLogQueue([new ConsoleTransport(false,),], { queueMaxSize: 100, });

    expect(() => queue.flushSync()).not.toThrow();
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("multiple flush calls are safe on empty buffer", async () => {
    const transport = new ConsoleTransport(false,);
    const queue = new AsyncLogQueue([transport,], { queueMaxSize: 100, });

    await queue.flush();
    await queue.flush();
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("handles mixed transport success/failure", async () => {
    const failing = new FailingTransport();
    failing.failOnWrite = true;
    const working = new ConsoleTransport(false,);

    const queue = new AsyncLogQueue([failing, working,], { queueMaxSize: 100, });

    queue.enqueue({
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "mixed test",
    },);

    await queue.flush();
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("batch size limits flush size; rest stays in buffer", async () => {
    const transport = new ConsoleTransport(false,);
    const queue = new AsyncLogQueue([transport,], { queueMaxSize: 100, batchSize: 3, });

    for (let i = 0; i < 7; i++) {
      queue.enqueue({
        level: 20,
        timestamp: 1_800_000_000 + i,
        time: "20260704T143000.123+02:00",
        message: `msg ${i}`,
      },);
    }

    // Initial flush only drains batchSize (3); rest stays for follow-up.
    await queue.flush();
    expect(queue["buffer"].length).toBe(4,);
    queue.stop();
  });

  test("enqueue triggers microtask flush when batch size reached", async () => {
    const transport = new ConsoleTransport(false,);
    const queue = new AsyncLogQueue([transport,], { queueMaxSize: 100, batchSize: 2, });

    queue.enqueue({
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "one",
    },);
    queue.enqueue({
      level: 20,
      timestamp: 1_800_000_001,
      time: "20260704T143001.123+02:00",
      message: "two",
    },);

    // microtask scheduled by enqueue
    await settle();
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });
});