// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { AsyncLogQueueBase, } from "./queue-base";
import type { LogEntry, Transport, } from "./types";

/**
 * Concrete implementation for testing the abstract base class
 */
class TestQueue extends AsyncLogQueueBase {
  flushedEntries: LogEntry[] = [];

  constructor(transports: Transport[], options?: {
    flushInterval?: number;
    batchSize?: number;
    queueMaxSize?: number;
  },) {
    super(transports, options,);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) { return; }
    this.flushing = true;
    try {
      await this.flushToTransports();
    } finally {
      this.flushing = false;
    }
    this.flushedEntries.push(...this.buffer.splice(0, this.buffer.length,));
  }

  protected setupTimerUnref(): void {
    // noop for test
  }

  protected handleTransportFailure(): void {
    // noop for test
  }

  flushSync(): void {
    this.flushedEntries.push(...this.buffer.splice(0, this.buffer.length,));
  }
}

/** Mock transport for testing */
class MockTransport implements Transport {
  readonly name = "mock";
  written: LogEntry[] = [];
  flushCalled = false;

  async write(entry: LogEntry): Promise<void> {
    this.written.push(entry,);
  }

  async flush(): Promise<void> {
    this.flushCalled = true;
  }
}

describe("AsyncLogQueueBase", () => {
  test("has correct default configuration", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,]);
    expect(queue["flushInterval"]).toBe(100,);
    expect(queue["batchSize"]).toBe(50,);
    expect(queue["queueMaxSize"]).toBe(10_000,);
  });

  test("accepts custom options", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], {
      flushInterval: 200,
      batchSize: 10,
      queueMaxSize: 500,
    },);
    expect(queue["flushInterval"]).toBe(200,);
    expect(queue["batchSize"]).toBe(10,);
    expect(queue["queueMaxSize"]).toBe(500,);
  });

  test("start begins the timer", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,]);
    queue.start();
    expect(queue["timer"]).not.toBeNull();
    queue.stop();
  });

  test("stop clears the timer", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,]);
    queue.start();
    expect(queue["timer"]).not.toBeNull();
    queue.stop();
    expect(queue["timer"]).toBeNull();
  });

  test("start is idempotent", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,]);
    queue.start();
    const timer1 = queue["timer"];
    queue.start();
    expect(queue["timer"]).toBe(timer1,);
    queue.stop();
  });

  test("stop does nothing when timer not started", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,]);
    expect(() => queue.stop()).not.toThrow();
  });

  test("enqueue adds entry to buffer", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], { queueMaxSize: 100, });

    const entry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "test",
    };

    queue.enqueue(entry,);
    expect(queue["buffer"].length).toBe(1,);
    expect(queue["buffer"][0]).toBe(entry,);
    queue.stop();
  });

  test("enqueue respects queueMaxSize and drops when full", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], { queueMaxSize: 2, });

    const entry1: LogEntry = {
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "entry1",
    };

    const entry2: LogEntry = {
      level: 20,
      timestamp: 1_800_000_001,
      time: "20260704T143001.123+02:00",
      message: "entry2",
    };

    const entry3: LogEntry = {
      level: 20,
      timestamp: 1_800_000_002,
      time: "20260704T143002.123+02:00",
      message: "entry3",
    };

    queue.enqueue(entry1,);
    queue.enqueue(entry2,);
    queue.enqueue(entry3,); // Should be dropped

    expect(queue["buffer"].length).toBe(2,);
    expect(queue["droppedCount"]).toBe(1,);
    queue.stop();
  });

  test("enqueue logs warning when buffer recovers from full after drop", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], { queueMaxSize: 2, });

    const entry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "test",
    };

    // Fill queue and drop
    queue.enqueue(entry,);
    queue.enqueue(entry,);
    queue.enqueue(entry,);
    expect(queue["droppedCount"]).toBe(1,);

    // Clear buffer
    queue["buffer"].length = 0;

    // Enqueue again should add warning entry
    queue.enqueue(entry,);
    expect(queue["buffer"].length).toBe(2,); // warning + actual entry
    expect(queue["buffer"][0]!.message).toContain("dropped",);
    expect(queue["droppedCount"]).toBe(0,);

    queue.stop();
  });

  test("enqueue triggers immediate flush when batch size reached", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], { queueMaxSize: 100, batchSize: 3, });

    const makeEntry = (n: number): LogEntry => ({
      level: 20,
      timestamp: 1_800_000_000 + n,
      time: "20260704T143000.123+02:00",
      message: `msg ${n}`,
    });

    queue.enqueue(makeEntry(1),);
    queue.enqueue(makeEntry(2),);
    expect(queue["buffer"].length).toBe(2,);

    queue.enqueue(makeEntry(3),); // batch size reached
    // Note: actual flush happens in microtask, so buffer may still have items
    // but the microtask callback schedules a flush
    expect(queue["buffer"].length).toBe(3,); // still there before microtask runs

    queue.stop();
  });

  test("flush processes all entries", async () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], { queueMaxSize: 100, });

    const entries: LogEntry[] = [];
    for (let i = 0; i < 3; i++) {
      const entry: LogEntry = {
        level: 20,
        timestamp: 1_800_000_000 + i,
        time: "20260704T143000.123+02:00",
        message: `msg ${i}`,
      };
      queue.enqueue(entry,);
      entries.push(entry,);
    }

    await queue.flush();

    expect(transport.written.length).toBe(3,);
    expect(queue["buffer"].length).toBe(0,);
    queue.stop();
  });

  test("flush is idempotent when already flushing", async () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], { queueMaxSize: 100, });

    queue.enqueue({ level: 20, timestamp: 1, time: "", message: "test", },);

    // Start a flush
    const flushPromise = queue.flush();

    // Call flush again while first is in progress
    await queue.flush();

    await flushPromise;

    queue.stop();
  });

  test("flush does nothing when buffer empty", async () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], { queueMaxSize: 100, });

    await queue.flush();
    expect(transport.written.length).toBe(0,);
    queue.stop();
  });

  test("flushSync clears buffer and returns entries", () => {
    const transport = new MockTransport();
    const queue = new TestQueue([transport,], { queueMaxSize: 100, });

    queue.enqueue({ level: 20, timestamp: 1, time: "", message: "test", },);
    queue.enqueue({ level: 30, timestamp: 2, time: "", message: "test2", },);

    queue.flushSync();

    expect(queue["buffer"].length).toBe(0,);
    expect(queue.flushedEntries.length).toBe(2,);
    queue.stop();
  });
});