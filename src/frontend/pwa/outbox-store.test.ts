// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outbox store unit tests (slices 2-3): FIFO order, drain delivery with the
 * SAME idempotency key, offline pauses, poison 4xx drops (only that entry),
 * max-attempt drops, single-flight, and no-clobber (enqueue during a drain
 * round survives). Storage is injected — no browser globals required.
 */
import { describe, expect, test, } from "bun:test";
import {
  createOutbox,
  isOfflineClassError,
  OUTBOX_MAX_ATTEMPTS,
  type OutboxDrainReport,
  type OutboxEntry,
  type OutboxSend,
  type OutboxSendResult,
  type OutboxStorage,
} from "./outbox-store";

/** In-memory storage fake mirroring the localStorage surface. */
function fakeStorage(): OutboxStorage & { dump(): string; failNextSet(): void } {
  let map = new Map<string, string>();
  let failNextSet = false;
  return {
    getItem: (key,) => map.get(key,) ?? null,
    setItem: (key, value,) => {
      if (failNextSet) {
        failNextSet = false;
        throw new Error("quota exceeded",);
      }

      map.set(key, value,);
    },
    removeItem: (key,) => {
      map.delete(key,);
    },
    dump: () => map.get("ll-outbox-v1",) ?? "",
    failNextSet: () => {
      failNextSet = true;
    },
  };
}

const enqueueTwo = (store: ReturnType<typeof createOutbox>,): OutboxEntry[] => [
  store.enqueue({ chatId: "chat-a", idempotencyKey: "key-1", body: '{"content":"first"}', },),
  store.enqueue({ chatId: "chat-b", idempotencyKey: "key-2", body: '{"content":"second"}', },),
];

const okSend = (): { send: OutboxSend; sent: OutboxEntry[] } => {
  const sent: OutboxEntry[] = [];
  return {
    sent,
    send: async (entry,) => {
      sent.push(entry,);
      return { ok: true, status: 201, };
    },
  };
};

describe("outbox store — enqueue / FIFO", () => {
  test("enqueue preserves FIFO order and store-assigned fields", () => {
    const storage = fakeStorage();
    let clock = 1000;
    const store = createOutbox({ storage, now: () => clock, },);
    const [first, second,] = enqueueTwo(store,);

    expect(store.depth(),).toBe(2,);
    expect(first.id,).not.toBe(second.id,);
    expect(first.enqueuedAt,).toBe(1000,);
    expect(first.attempts,).toBe(0,);
    clock = 2000;
    store.enqueue({ chatId: "chat-c", idempotencyKey: "key-3", body: "{}", },);
    expect(store.entries().map((e,) => e.idempotencyKey),).toEqual(["key-1", "key-2", "key-3",],);
  });

  test("without storage the store is inert (no browser globals in tests)", () => {
    const store = createOutbox({ storage: null, },);
    store.enqueue({ chatId: "c", idempotencyKey: "k", body: "b", },);
    expect(store.depth(),).toBe(0,);
  });

  test("a corrupt payload reads as empty and heals on the next write", () => {
    const storage = fakeStorage();
    storage.setItem("ll-outbox-v1", "not json at all{{{",);
    const store = createOutbox({ storage, },);
    expect(store.entries(),).toEqual([],);
    store.enqueue({ chatId: "c", idempotencyKey: "k", body: "b", },);
    expect(store.depth(),).toBe(1,);
    expect(JSON.parse(storage.dump(),),).toBeInstanceOf(Array,);
  });

  test("shape-invalid rows are skipped, valid ones kept", () => {
    const storage = fakeStorage();
    const good = {
      id: "e1",
      chatId: "c",
      idempotencyKey: "k",
      body: "b",
      enqueuedAt: 1,
      attempts: 0,
    };

    storage.setItem("ll-outbox-v1", JSON.stringify([good, { id: "bad", }, null, 42,],),);
    const store = createOutbox({ storage, },);
    expect(store.entries().map((e,) => e.id),).toEqual(["e1",],);
  });

  test("storage write failures are swallowed (quota) without losing the entry", () => {
    const storage = fakeStorage();
    const store = createOutbox({ storage, },);
    store.enqueue({ chatId: "c", idempotencyKey: "k", body: "b", },);
    storage.failNextSet();
    // This enqueue's write fails, but the call must not throw.
    expect(() => store.enqueue({ chatId: "c2", idempotencyKey: "k2", body: "b2", },)).not.toThrow();
  });
});

describe("outbox store — drain", () => {
  test("delivers FIFO in order with the SAME idempotency key, removing on 2xx", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    const queued = enqueueTwo(store,);
    const { send, sent, } = okSend();

    const report = await store.drain(send,);

    expect(sent.map((e,) => e.idempotencyKey),).toEqual(["key-1", "key-2",],);
    expect(sent.map((e,) => e.body),).toEqual(queued.map((e,) => e.body),);
    expect(report.delivered.map((e,) => e.id),).toEqual(queued.map((e,) => e.id),);
    expect(report.dropped,).toEqual([],);
    expect(report.pending,).toBe(0,);
    expect(store.depth(),).toBe(0,);
  });

  test("an offline-class throw pauses the round and keeps everything queued", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    enqueueTwo(store,);
    let calls = 0;
    const report = await store.drain(async () => {
      calls += 1;
      throw new TypeError("Failed to fetch",);
    },);

    expect(calls,).toBe(1,); // stops at the first offline failure
    expect(report.delivered,).toEqual([],);
    expect(report.dropped,).toEqual([],);
    expect(report.pending,).toBe(2,);
    expect(store.entries()[0]?.attempts,).toBe(0,); // offline never counts toward poison
  });

  test("a poison 4xx drops ONLY that entry and keeps draining the rest", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    const queued = enqueueTwo(store,);
    const { send, sent, } = okSend();
    let first = true;
    const mixedSend: OutboxSend = async (entry,) => {
      if (first) {
        first = false;
        return { ok: false, status: 409, };
      }

      return send(entry,);
    };

    const report = await store.drain(mixedSend,);

    expect(report.dropped,).toEqual([
      { entry: queued[0], reason: "poison", status: 409, },
    ],);

    expect(report.delivered.map((e,) => e.id),).toEqual([queued[1]?.id,],);
    expect(sent.map((e,) => e.idempotencyKey),).toEqual(["key-2",],); // second entry still replayed
    expect(store.depth(),).toBe(0,);
  });

  test("a 5xx counts an attempt, pauses the round, and keeps the entry", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    enqueueTwo(store,);
    const report = await store.drain(async () => ({ ok: false, status: 503, }));

    expect(report.delivered,).toEqual([],);
    expect(report.dropped,).toEqual([],);
    expect(store.entries()[0]?.attempts,).toBe(1,);
    expect(store.entries()[1]?.attempts,).toBe(0,); // round paused on the first failure
    expect(report.pending,).toBe(2,);
  });

  test("poison policy: max attempts then surface + drop with the message", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    const [poisoned, fresh,] = enqueueTwo(store,);

    // Rounds 1 + 2: 503 twice → attempts 1, 2, round pauses each time.
    await store.drain(async () => ({ ok: false, status: 503, }));
    await store.drain(async () => ({ ok: false, status: 503, }));
    expect(store.entries()[0]?.attempts,).toBe(2,);

    // Round 3: a third 5xx crosses OUTBOX_MAX_ATTEMPTS → the poisoned entry is
    // surfaced + dropped; the round continues to the next entry (fresh 503 →
    // attempt 1, paused — order preserved, nothing after it sent).
    const report = await store.drain(async () => ({ ok: false, status: 503, }));
    expect(OUTBOX_MAX_ATTEMPTS,).toBe(3,);
    expect(report.dropped.map((d,) => d.entry.id),).toEqual([poisoned?.id,],);
    expect(report.dropped[0]?.reason,).toBe("max-attempts",);
    expect(report.dropped[0]?.status,).toBe(503,);
    expect(report.delivered,).toEqual([],);
    expect(store.entries().map((e,) => e.id),).toEqual([fresh?.id,],);
    expect(store.entries()[0]?.attempts,).toBe(1,);
  });

  test("a previously-failed entry still delivers when a replay succeeds", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    const [first, second,] = enqueueTwo(store,);
    // Round 1 pauses on the first entry's 5xx (attempt 1 recorded).
    await store.drain(async () => ({ ok: false, status: 503, }));
    expect(store.entries()[0]?.attempts,).toBe(1,);
    // Round 2 succeeds: a previously-failed entry delivers — attempts never
    // block a success, and the whole FIFO drains.
    const report = await store.drain(async () => ({ ok: true, status: 201, }));
    expect(report.delivered.map((e,) => e.id),).toEqual([first?.id, second?.id,],);
    expect(report.dropped,).toEqual([],);
    expect(store.depth(),).toBe(0,);
  });

  test("drain is single-flighted: concurrent calls share one round", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    enqueueTwo(store,);
    let inFlight = 0;
    let maxConcurrent = 0;
    const slowSend: OutboxSend = async (entry,) => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight,);
      await new Promise((resolve,) => setTimeout(resolve, 5,));
      inFlight -= 1;
      return { ok: true, status: 201, };
    };

    const [a, b,] = [store.drain(slowSend,), store.drain(slowSend,),];
    const reports: OutboxDrainReport[] = await Promise.all([a, b,],);

    expect(store.draining(),).toBe(false,);
    expect(maxConcurrent,).toBe(1,);
    // Both callers observe the SAME single round: 2 delivered, not 4.
    for (const report of reports) {
      expect(report.delivered,).toHaveLength(2,);
    }

    expect(store.depth(),).toBe(0,);
  });

  test("no-clobber: an entry enqueued during a drain survives the round's writes", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    store.enqueue({ chatId: "chat-a", idempotencyKey: "key-1", body: "{}", },);
    const send: OutboxSend = async () => {
      // Mid-round enqueue — the drain's snapshot predates it.
      store.enqueue({ chatId: "chat-b", idempotencyKey: "key-2", body: "{}", },);
      return { ok: true, status: 201, };
    };

    const report = await store.drain(send,);

    expect(report.delivered,).toHaveLength(1,);
    expect(store.depth(),).toBe(1,);
    expect(store.entries()[0]?.idempotencyKey,).toBe("key-2",);
  });

  test("drain on an empty outbox is a no-op", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    const { send, sent, } = okSend();
    const report = await store.drain(send,);
    expect(sent,).toEqual([],);
    expect(report.pending,).toBe(0,);
  });
});

describe("isOfflineClassError", () => {
  test("TypeError / no-status errors are offline-class", () => {
    expect(isOfflineClassError(new TypeError("Failed to fetch",),),).toBe(true,);
    expect(isOfflineClassError(new Error("Request timed out after 30000ms",),),).toBe(true,);
    expect(isOfflineClassError("weird",),).toBe(true,);
  });

  test("HTTP-attached errors and 401 are not offline", () => {
    const httpish = Object.assign(new Error("HTTP 429",), { status: 429, },);
    expect(isOfflineClassError(httpish,),).toBe(false,);
    expect(isOfflineClassError(new Error("Unauthorized",),),).toBe(false,);
  });
});

describe("outbox store — discard", () => {
  test("discard removes exactly the targeted entry, order preserved", () => {
    const storage = fakeStorage();
    const store = createOutbox({ storage, },);
    const [first, second, third,] = [
      store.enqueue({ chatId: "chat-a", idempotencyKey: "key-1", body: '{"content":"first"}', },),
      store.enqueue({ chatId: "chat-b", idempotencyKey: "key-2", body: '{"content":"second"}', },),
      store.enqueue({ chatId: "chat-c", idempotencyKey: "key-3", body: '{"content":"third"}', },),
    ];

    expect(store.discard(second.id,),).toBe(true,);
    expect(store.depth(),).toBe(2,);
    expect(store.entries().map((entry,) => entry.id),).toEqual([first.id, third.id,],);

    // Persisted: storage holds only the surviving entries.
    const persisted = JSON.parse(storage.dump(),) as OutboxEntry[];
    expect(persisted.map((entry,) => entry.id),).toEqual([first.id, third.id,],);
  });

  test("discard of an unknown id is a no-op returning false", () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    store.enqueue({ chatId: "chat-a", idempotencyKey: "key-1", body: '{"content":"first"}', },);

    expect(store.discard("no-such-id",),).toBe(false,);
    expect(store.depth(),).toBe(1,);
  });

  test("discard during a drain round does not clobber the round's writes", async () => {
    const store = createOutbox({ storage: fakeStorage(), },);
    const [first, second,] = enqueueTwo(store,);

    // Slow transport: the discard lands while the round is between sends.
    const report = await store.drain(async (entry,) => {
      if (entry.id === first.id) {
        expect(store.discard(second.id,),).toBe(true,);
      }

      return { ok: true, status: 201, };
    },);

    expect(report.delivered.map((entry,) => entry.id),).toEqual([first.id,],);
    expect(store.depth(),).toBe(0,);
  });
});
