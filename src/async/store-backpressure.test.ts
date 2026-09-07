// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Backpressure + shutdown coverage for `createAsyncStore`:
 *   - writes beyond `queueLimit` are dropped (oldest drain in flight),
 *   - `destroy()` makes the store ignore all further writes.
 *
 * Uses a gate-controlled Kysely mock so the drain can be held mid-flight
 * deterministically while the queue fills up.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { createAsyncStore, } from "./store";

// The store logs drops/warnings via getLogger(); ensure an instance exists
// before the mock-based test runs (createTestDb would do it otherwise).
try {
  createLogger({ level: "error", },);
} catch {
  // already initialized by another suite in this process
}

/**
 * Kysely mock that suspends every insert `execute()` behind a gate, so the
 * store's drain loop parks on the first write while the test enqueues more.
 * Records each inserted id in completion order.
 */
function makeGatedDb(): {
  mock: Kysely<DB>;
  insertedIds: string[];
  openGate: () => void;
} {
  const insertedIds: string[] = [];
  let gateOpen = false;
  const waiters: Array<() => void> = [];

  const mock = {
    insertInto(_table: string,) {
      return {
        values(values: { id: string },) {
          return {
            onConflict(_cb: unknown,) {
              return {
                execute(): Promise<void> {
                  insertedIds.push(values.id,);
                  if (gateOpen) { return Promise.resolve(void 0,); }
                  const { promise, resolve, } = Promise.withResolvers<void>();
                  waiters.push(resolve,);
                  return promise;
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Kysely<DB>;

  return {
    mock,
    insertedIds,
    openGate(): void {
      gateOpen = true;
      for (const resolve of waiters.splice(0,)) { resolve(); }
    },
  };
}

describe("AsyncStore backpressure", () => {
  test("drops writes beyond queueLimit while the drain is busy", async () => {
    const { mock, insertedIds, openGate, } = makeGatedDb();
    const store = createAsyncStore(mock, { queueLimit: 2, },);
    const track = (id: string,): void => {
      store.track({ id, method: "POST", routePattern: "/api/q", userId: null, },);
    };

    // w1 parks inside `apply()` (gate closed). w2+w3 fill the queue
    // (limit 2). w4 arrives when the queue is full → must be dropped.
    track("w1",);
    track("w2",);
    track("w3",);
    track("w4",);

    // Only w1 reached the "DB" — w4 was dropped, not queued behind the gate.
    expect(insertedIds,).toEqual(["w1",],);

    openGate();
    await store.flush();

    // Exactly the three accepted writes land; the overflow write never does.
    expect(insertedIds,).toEqual(["w1", "w2", "w3",],);
    expect(insertedIds.includes("w4",),).toBe(false,);
  });
});

describe("AsyncStore shutdown", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
  },);

  afterEach(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("destroy() ignores subsequent writes", async () => {
    const store = createAsyncStore(db, {},);
    store.destroy();

    // Post-destroy writes are silently ignored.
    store.track({ id: "post-destroy", method: "GET", routePattern: "/api/x", userId: null, },);
    await store.flush();

    const row = await store.read("post-destroy",);
    expect(row,).toBeNull();
  });
});
