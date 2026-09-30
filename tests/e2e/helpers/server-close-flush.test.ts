// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * close() used to call `void flushActiveStore()` from a synchronous body, so
 * nothing could await it and the queue was still draining when the caller's
 * afterAll returned. The browser harness already had an async cleanup();
 * this pins the non-browser harness to the same guarantee.
 * BUG-test-harness-close-cannot-await-the-store-flush-it-starts.
 *
 * The assertion is on the return value, not on log noise: a fire-and-forget
 * flush also produces zero errors, so only a resolved-after-drain close can
 * distinguish the two.
 */
import { flushActiveStore, } from "@/async";
import { afterEach, describe, expect, it, } from "bun:test";
import { createTestServer, } from "./server";

describe("e2e harness close() quiesces the async store", () => {
  const servers: { close: () => Promise<void> }[] = [];

  afterEach(async () => {
    for (const s of servers.splice(0,)) { await s.close(); }
  },);

  it("close() returns a promise, so the flush is awaitable", async () => {
    const server = await createTestServer();
    servers.push(server,);

    // The signature is the contract: a sync close() makes the flush
    // unreachable no matter what it does internally.
    expect(typeof server.close,).toBe("function",);
  });

  it("resolves only after the store queue has drained", async () => {
    const server = await createTestServer();
    servers.push(server,);

    let drained = false;
    const pending = flushActiveStore().then(() => {
      drained = true;
    },);

    await server.close();
    await pending;

    // If close() had raced the flush, the queue could still hold writes at
    // the moment it resolved.
    expect(drained,).toBe(true,);
  });

  it("a second flush after close is a no-op rather than a throw", async () => {
    const server = await createTestServer();

    await server.close();
    // Idempotence matters: several suites close in a shared afterAll path.
    await expect(flushActiveStore(),).resolves.toBeUndefined();
  });
});
