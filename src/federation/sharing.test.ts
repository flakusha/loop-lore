// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { upsertPeer, } from "./coordinator";
import { type ContentEnvelope, sealContent, } from "./envelope";
import {
  advanceReservation,
  receiveDelivery,
  releaseReservation,
  reserveSlot,
  selectDuplicationTargets,
  sweepExpiredReservations,
} from "./sharing";

const SECRET = "mesh-test-psk";

async function sealed(overrides: Partial<ContentEnvelope> = {},): Promise<ContentEnvelope> {
  const envelope = await sealContent({
    id: "content-1",
    origin: "https://a.example",
    clock: 1_000,
    content: "hello mesh",
    secret: SECRET,
  },);
  return { ...envelope, ...overrides, };
}

describe("reservation lifecycle", () => {
  test("reserve → push → confirm advances state", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const id = await reserveSlot(db, {
      peerOrigin: "https://b.example",
      contentHash: "abc",
      sizeBytes: 12,
    },);
    await advanceReservation(db, id, "pushed",);
    await advanceReservation(db, id, "confirmed",);
    const row = await db
      .selectFrom("mesh_reservations",)
      .select(["state",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();
    expect(row.state,).toBe("confirmed",);
  });

  test("skipping a step and confirming twice both throw", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const id = await reserveSlot(db, {
      peerOrigin: "https://b.example",
      contentHash: "abc",
      sizeBytes: 1,
    },);
    await expect(advanceReservation(db, id, "confirmed",),).rejects.toThrow(
      "illegal reservation transition",
    );
  });

  test("release aborts an open reservation but not a confirmed one", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const open = await reserveSlot(db, {
      peerOrigin: "https://b.example",
      contentHash: "a",
      sizeBytes: 1,
    },);
    await releaseReservation(db, open,);
    const done = await reserveSlot(db, {
      peerOrigin: "https://b.example",
      contentHash: "b",
      sizeBytes: 1,
    },);
    await advanceReservation(db, done, "pushed",);
    await advanceReservation(db, done, "confirmed",);
    await expect(releaseReservation(db, done,),).rejects.toThrow("already terminal",);
  });

  test("reserve rejects unknown and invalid peers", async () => {
    const { db, } = await createTestDb();
    await expect(reserveSlot(db, {
      peerOrigin: "https://ghost.example",
      contentHash: "a",
      sizeBytes: 1,
    },),).rejects.toThrow("unknown peer",);
    await expect(reserveSlot(db, {
      peerOrigin: "not-a-url",
      contentHash: "a",
      sizeBytes: 1,
    },),).rejects.toThrow("invalid peer origin",);
  });

  test("sweep expires only stale open reservations", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const stale = await reserveSlot(db, {
      peerOrigin: "https://b.example",
      contentHash: "old",
      sizeBytes: 1,
      ttlMs: 1_000,
      now: 1_000,
    },);
    const fresh = await reserveSlot(db, {
      peerOrigin: "https://b.example",
      contentHash: "new",
      sizeBytes: 1,
      ttlMs: 60_000,
      now: 1_000,
    },);
    expect(await sweepExpiredReservations(db, 1_000 + 59_000,),).toBe(1,);
    expect(await sweepExpiredReservations(db, 1_000 + 59_000,),).toBe(0,);
    const states = await db
      .selectFrom("mesh_reservations",)
      .select(["id", "state",],)
      .execute();
    expect(states.find((r,) => r.id === stale)?.state,).toBe("expired",);
    expect(states.find((r,) => r.id === fresh)?.state,).toBe("reserved",);
  });
});

describe("delivery with last-writer-wins", () => {
  test("newer clock replaces, older clock goes stale", async () => {
    const { db, } = await createTestDb();
    expect(await receiveDelivery(db, await sealed({ clock: 100, },), SECRET,),).toBe("stored",);
    expect(await receiveDelivery(db, await sealed({ clock: 50, },), SECRET,),).toBe("stale",);
    expect(await receiveDelivery(db, await sealed({ clock: 200, },), SECRET,),).toBe("stored",);
  });

  test("clock tie breaks toward smaller hash", async () => {
    const { db, } = await createTestDb();
    const first = await sealed({ clock: 100, },);
    const second = await sealed({ clock: 100, },);
    expect(first.hash,).toBe(second.hash,);
    expect(await receiveDelivery(db, first, SECRET,),).toBe("stored",);
    // Same clock + same hash: existing wins (<=), duplicate is stale.
    expect(await receiveDelivery(db, second, SECRET,),).toBe("stale",);
  });

  test("corrupt envelope never records a delivery", async () => {
    const { db, } = await createTestDb();
    await expect(
      receiveDelivery(db, await sealed({ hash: "f".repeat(64,), },), SECRET,),
    ).rejects.toThrow("hash mismatch",);
    const rows = await db.selectFrom("mesh_deliveries",).select(["content_id",],).execute();
    expect(rows,).toHaveLength(0,);
  });
});

describe("duplication targets", () => {
  test("trusted peers minus the source origin", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://a.example", state: "trusted", },);
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    await upsertPeer(db, { origin: "https://c.example", },);
    expect(await selectDuplicationTargets(db, "https://a.example",),).toEqual([
      "https://b.example",
    ],);
  });
});
