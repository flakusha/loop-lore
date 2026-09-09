// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  advanceNegotiation,
  beginNegotiation,
  listPeers,
  runResyncPass,
  setPeerState,
  upsertPeer,
} from "./coordinator";

describe("coordinator registry", () => {
  test("upsert inserts pending by default and re-upsert updates", async () => {
    const { db, } = await createTestDb();
    const origin = await upsertPeer(db, { origin: "https://peer.example", },);
    expect(origin,).toBe("https://peer.example",);
    await upsertPeer(db, { origin: "https://peer.example/", state: "trusted", },);
    const peers = await listPeers(db,);
    expect(peers,).toHaveLength(1,);
    expect(peers[0]?.state,).toBe("trusted",);
    expect(await listPeers(db, "pending",),).toHaveLength(0,);
  });

  test("upsert rejects non-http origins", async () => {
    const { db, } = await createTestDb();
    await expect(upsertPeer(db, { origin: "not-a-url", },),).rejects.toThrow("invalid peer origin",);
  });

  test("setPeerState throws for unknown peers", async () => {
    const { db, } = await createTestDb();
    await expect(setPeerState(db, "https://ghost.example", "trusted",),).rejects.toThrow("unknown peer",);
  });
});

describe("negotiation state machine", () => {
  test("full handshake chain reaches established", async () => {
    const { db, } = await createTestDb();
    const origin = await upsertPeer(db, { origin: "https://peer.example", },);
    const id = await beginNegotiation(db, origin,);
    for (const next of ["handshake", "capability-exchange", "quota-agreement", "established",] as const) {
      await advanceNegotiation(db, id, next,);
    }
    const row = await db
      .selectFrom("mesh_negotiations",)
      .select(["state",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();
    expect(row.state,).toBe("established",);
  });

  test("skipping a step throws and leaves state untouched", async () => {
    const { db, } = await createTestDb();
    const origin = await upsertPeer(db, { origin: "https://peer.example", },);
    const id = await beginNegotiation(db, origin,);
    await expect(advanceNegotiation(db, id, "established",),).rejects.toThrow("illegal negotiation transition",);
    const row = await db
      .selectFrom("mesh_negotiations",)
      .select(["state",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();
    expect(row.state,).toBe("idle",);
  });

  test("close is legal from any open state and terminal", async () => {
    const { db, } = await createTestDb();
    const origin = await upsertPeer(db, { origin: "https://peer.example", },);
    const id = await beginNegotiation(db, origin,);
    await advanceNegotiation(db, id, "closed",);
    await expect(advanceNegotiation(db, id, "handshake",),).rejects.toThrow("illegal negotiation transition",);
  });

  test("begin and advance throw for unknown ids", async () => {
    const { db, } = await createTestDb();
    await expect(beginNegotiation(db, "https://ghost.example",),).rejects.toThrow("unknown peer",);
    await expect(advanceNegotiation(db, "nope", "closed",),).rejects.toThrow("unknown negotiation",);
  });
});

describe("resync pass", () => {
  test("alive trusted peers refresh, misses and pending peers skip", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://alive.example", state: "trusted", },);
    await upsertPeer(db, { origin: "https://dead.example", state: "trusted", },);
    await upsertPeer(db, { origin: "https://pending.example", },);
    const summary = await runResyncPass(db, {
      fetchImpl: async (url,) => url.startsWith("https://alive.example",)
        ? { ok: true, status: 200, body: { peers: ["https://friend.example",], }, }
        : { ok: false, status: 0, body: null, },
    },);
    expect(summary,).toEqual({ checked: 2, alive: 1, },);
    const alive = await db
      .selectFrom("mesh_peers",)
      .select(["capabilities", "last_seen",],)
      .where("origin", "=", "https://alive.example",)
      .executeTakeFirstOrThrow();
    expect(alive.capabilities,).toBe('["https://friend.example"]',);
    expect(alive.last_seen,).not.toBeNull();
  });
});
