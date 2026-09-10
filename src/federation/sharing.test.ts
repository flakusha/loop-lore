// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DuplicationPolicy, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { pskCipher, } from "./cipher";
import { upsertPeer, } from "./coordinator";
import { createMeshEncryption, } from "./encryption";
import { type ContentEnvelope, openEnvelope, sealContent, } from "./envelope";
import type { PeerPost, } from "./peer-fetch";
import {
  advanceReservation,
  createInboundReservation,
  fanOutContent,
  outstandingBytes,
  pushEnvelope,
  receiveDelivery,
  releaseReservation,
  requestReservation,
  resolveDuplicationPolicy,
  selectDuplicationTargets,
  sweepExpiredReservations,
} from "./sharing";
const SECRET = "mesh-test-psk";
const cipher = pskCipher(SECRET,);
const encryption = createMeshEncryption(SECRET,);

async function sealed(
  overrides: { id?: string; origin?: string; clock?: number; content?: string } = {},
): Promise<ContentEnvelope> {
  return sealContent({
    id: overrides.id ?? "content-1",
    origin: overrides.origin ?? "https://a.example",
    clock: overrides.clock ?? 1_000,
    content: overrides.content ?? "hello mesh",
    cipher,
  },);
}

const OK_POST: PeerPost = (async (url: string,) => {
  if (url.endsWith("/api/mesh-reserve",)) {
    return { ok: true, status: 200, body: { reservationId: "r-1", }, };
  }
  return { ok: true, status: 200, body: { verdict: "stored", }, };
}) as PeerPost;

describe("inbound reservation", () => {
  test("trusted peer reserves, unknown peer rejected", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const id = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "abc",
      sizeBytes: 12,
    },);
    expect(typeof id,).toBe("string",);
    await expect(createInboundReservation(db, {
      senderOrigin: "https://stranger.example",
      contentHash: "abc",
      sizeBytes: 1,
    },),).rejects.toThrow("untrusted peer",);
  });

  test("pending peer and invalid input rejected", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", },);
    await expect(createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "abc",
      sizeBytes: 1,
    },),).rejects.toThrow("untrusted peer",);
    await expect(createInboundReservation(db, {
      senderOrigin: "not a url",
      contentHash: "abc",
      sizeBytes: 1,
    },),).rejects.toThrow("invalid sender origin",);
  });

  test("capacity enforced and freed on release", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, {
      origin: "https://b.example",
      state: "trusted",
      capacityBytes: 100,
    },);
    const id = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "a",
      sizeBytes: 60,
    },);
    expect(await outstandingBytes(db, "https://b.example",),).toBe(60,);
    await expect(createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "b",
      sizeBytes: 50,
    },),).rejects.toThrow("capacity exhausted",);
    await releaseReservation(db, id,);
    expect(await outstandingBytes(db, "https://b.example",),).toBe(0,);
    const retry = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "b",
      sizeBytes: 50,
    },);
    expect(typeof retry,).toBe("string",);
  });

  test("null capacity is unlimited", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const id = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "a",
      sizeBytes: 10 ** 9,
    },);
    expect(typeof id,).toBe("string",);
  });

  test("non-finite sizes are rejected", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    for (const sizeBytes of [NaN, Infinity, -Infinity, 0, -3,]) {
      await expect(
        createInboundReservation(db, {
          senderOrigin: "https://b.example",
          contentHash: "a",
          sizeBytes,
        },),
      ).rejects.toThrow("invalid size",);
    }
  });
});

describe("reservation lifecycle", () => {
  test("reserve → push → confirm advances state", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const id = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
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
    const id = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "abc",
      sizeBytes: 1,
    },);
    await expect(advanceReservation(db, id, "confirmed",),).rejects.toThrow(
      "illegal reservation transition",
    );
  });

  test("release is terminal; sweep expires stale reservations", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const id = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "abc",
      sizeBytes: 1,
      ttlMs: 1,
    },);
    await releaseReservation(db, id,);
    await expect(releaseReservation(db, id,),).rejects.toThrow("already terminal",);
    const stale = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: "def",
      sizeBytes: 1,
      ttlMs: 1,
    },);
    expect(await sweepExpiredReservations(db, Date.now() + 60_000,),).toBe(1,);
    const row = await db
      .selectFrom("mesh_reservations",)
      .select(["state",],)
      .where("id", "=", stale,)
      .executeTakeFirstOrThrow();
    expect(row.state,).toBe("expired",);
  });
});

describe("delivery", () => {
  test("stored delivery confirms its reservation", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    const envelope = await sealed({ origin: "https://b.example", clock: 5, },);
    const reservationId = await createInboundReservation(db, {
      senderOrigin: "https://b.example",
      contentHash: envelope.hash,
      sizeBytes: envelope.size,
    },);
    expect(
      await receiveDelivery(db, envelope, cipher, { reservationId, },),
    ).toBe("stored",);
    const row = await db
      .selectFrom("mesh_reservations",)
      .select(["state",],)
      .where("id", "=", reservationId,)
      .executeTakeFirstOrThrow();
    expect(row.state,).toBe("confirmed",);
  });

  test("lower clock is stale; tampered hash throws", async () => {
    const { db, } = await createTestDb();
    expect(await receiveDelivery(db, await sealed({ clock: 10, },), cipher,),).toBe("stored",);
    expect(await receiveDelivery(db, await sealed({ clock: 5, },), cipher,),).toBe("stale",);
    const tampered = await sealed();
    await expect(
      receiveDelivery(db, { ...tampered, hash: "0".repeat(64,), }, cipher,),
    ).rejects.toThrow("hash mismatch",);
  });
});

describe("sender transport", () => {
  test("requestReservation returns id plus content key; refusal throws", async () => {
    const keyed = (async () => ({
      ok: true,
      status: 200,
      body: { reservationId: "r-1", contentKey: "a2V5", },
    })) as unknown as PeerPost;
    expect(
      await requestReservation(keyed, "https://b.example", {
        senderOrigin: "https://a.example",
        contentHash: "abc",
        sizeBytes: 3,
      },),
    ).toEqual({ reservationId: "r-1", contentKey: "a2V5", },);
    expect(
      await requestReservation(OK_POST, "https://b.example", {
        senderOrigin: "https://a.example",
        contentHash: "abc",
        sizeBytes: 3,
      },),
    ).toEqual({ reservationId: "r-1", },);
    const refuse: PeerPost = (async () => ({ ok: false, status: 409, body: null, })) as PeerPost;
    await expect(
      requestReservation(refuse, "https://b.example", {
        senderOrigin: "https://a.example",
        contentHash: "abc",
        sizeBytes: 3,
      },),
    ).rejects.toThrow("reservation refused",);
  });

  test("pushEnvelope returns the verdict; refusal throws", async () => {
    expect(await pushEnvelope(OK_POST, "https://b.example", await sealed(), "r-1",),).toBe(
      "stored",
    );
    const refuse: PeerPost = (async () => ({ ok: false, status: 400, body: null, })) as PeerPost;
    await expect(
      pushEnvelope(refuse, "https://b.example", await sealed(),),
    ).rejects.toThrow("delivery refused",);
  });
});

describe("duplication targets", () => {
  test("trusted fans out, listed intersects, none disables", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    await upsertPeer(db, { origin: "https://c.example", state: "trusted", },);
    await upsertPeer(db, { origin: "https://pending.example", },);
    expect(
      await selectDuplicationTargets(db, { mode: "trusted", peers: [], }, "https://b.example",),
    ).toEqual(["https://c.example",],);
    expect(
      await selectDuplicationTargets(
        db,
        { mode: "listed", peers: ["https://c.example", "https://pending.example",], },
      ),
    ).toEqual(["https://c.example",],);
    expect(await selectDuplicationTargets(db, { mode: "none", peers: [], },),).toEqual([],);
  });

  test("world override applies; unknown world falls back", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    await upsertPeer(db, { origin: "https://c.example", state: "trusted", },);
    const policy: DuplicationPolicy = {
      mode: "trusted",
      peers: [],
      worlds: {
        "world-1": { mode: "listed", peers: ["https://c.example",], },
        "world-2": { mode: "none", peers: [], },
      },
    };
    expect(await selectDuplicationTargets(db, policy, undefined, "world-1",),).toEqual([
      "https://c.example",
    ],);
    expect(await selectDuplicationTargets(db, policy, undefined, "world-2",),).toEqual([],);
    expect(await selectDuplicationTargets(db, policy, undefined, "unknown",),).toEqual([
      "https://b.example",
      "https://c.example",
    ],);
    expect(await selectDuplicationTargets(db, policy,),).toEqual([
      "https://b.example",
      "https://c.example",
    ],);
    expect(resolveDuplicationPolicy(policy, "world-1",),).toEqual({
      mode: "listed",
      peers: ["https://c.example",],
    },);
    expect(resolveDuplicationPolicy(policy, "unknown",),).toBe(policy,);
  });
});

describe("sender fan-out", () => {
  const POLICY: DuplicationPolicy = { mode: "trusted", peers: [], };
  const KEY = Buffer.from("k".repeat(32,),).toString("base64",);

  /** @param db */
  async function twoPeers(db: Kysely<DB>,): Promise<void> {
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", },);
    await upsertPeer(db, { origin: "https://c.example", state: "trusted", },);
  }

  /**
   * Test-fake deliver bodies always carry an envelope; guard the shape
   * once instead of casting at every access.
   * @param body Fake transport body.
   */
  function pushEnvelopeOf(body: unknown,): ContentEnvelope {
    if (typeof body !== "object" || body === null || !("envelope" in body)) {
      throw new Error("expected deliver body with envelope",);
    }
    // Guarded above: fakes only ever send ContentEnvelope payloads.
    return body.envelope as ContentEnvelope;
  }

  test("seals with the issued contentKey and reports stored", async () => {
    const { db, } = await createTestDb();
    await twoPeers(db,);
    const delivered: ContentEnvelope[] = [];
    const post = (async (url: string, body: unknown,) => {
      if (url.endsWith("/api/mesh-reserve",)) {
        return { ok: true, status: 200, body: { reservationId: "r-fan", contentKey: KEY, }, };
      }
      delivered.push(pushEnvelopeOf(body,),);
      return { ok: true, status: 200, body: { verdict: "stored", }, };
    }) as PeerPost;
    const result = await fanOutContent(db, post, "https://a.example", POLICY, encryption, {
      id: "fan-1",
      content: "fan payload",
      clock: 7,
    },);
    expect(result.targets,).toEqual(["https://b.example", "https://c.example",],);
    expect(result.stored,).toEqual(["https://b.example", "https://c.example",],);
    expect(result.failed,).toEqual([],);
    expect(delivered,).toHaveLength(2,);
    for (const envelope of delivered) {
      const bytes = await openEnvelope(envelope, pskCipher(KEY,),);
      expect(new TextDecoder().decode(bytes,),).toBe("fan payload",);
      await expect(openEnvelope(envelope, cipher,),).rejects.toThrow();
    }
  });

  test("falls back to the PSK when no contentKey is issued", async () => {
    const { db, } = await createTestDb();
    await twoPeers(db,);
    const delivered: ContentEnvelope[] = [];
    const post = (async (url: string, body: unknown,) => {
      if (url.endsWith("/api/mesh-reserve",)) {
        return { ok: true, status: 200, body: { reservationId: "r-fan", }, };
      }
      delivered.push(pushEnvelopeOf(body,),);
      return { ok: true, status: 200, body: { verdict: "stale", }, };
    }) as PeerPost;
    const result = await fanOutContent(db, post, "https://a.example", POLICY, encryption, {
      id: "fan-2",
      content: "fallback payload",
      clock: 8,
    },);
    expect(result.stored,).toEqual([],);
    expect(result.stale,).toEqual(["https://b.example", "https://c.example",],);
    for (const envelope of delivered) {
      const bytes = await openEnvelope(envelope, cipher,);
      expect(new TextDecoder().decode(bytes,),).toBe("fallback payload",);
    }
  });

  test("one target's refusal never blocks the others", async () => {
    const { db, } = await createTestDb();
    await twoPeers(db,);
    const post = (async (url: string,) => {
      if (url.endsWith("/api/mesh-reserve",)) {
        if (url.startsWith("https://c.example",)) {
          return { ok: false, status: 409, body: null, };
        }
        return { ok: true, status: 200, body: { reservationId: "r-fan", }, };
      }
      return { ok: true, status: 200, body: { verdict: "stored", }, };
    }) as PeerPost;
    const result = await fanOutContent(db, post, "https://a.example", POLICY, encryption, {
      id: "fan-3",
      content: "partial payload",
      clock: 9,
    },);
    expect(result.stored,).toEqual(["https://b.example",],);
    expect(result.failed,).toHaveLength(1,);
    expect(result.failed[0]?.origin,).toBe("https://c.example",);
    expect(result.failed[0]?.error,).toMatch(/reservation refused/,);
  });

  test("disabled policy attempts nothing", async () => {
    const { db, } = await createTestDb();
    await twoPeers(db,);
    let calls = 0;
    const post = (async () => {
      calls += 1;
      return { ok: true, status: 200, body: {}, };
    }) as PeerPost;
    const result = await fanOutContent(
      db,
      post,
      "https://a.example",
      { mode: "none", peers: [], },
      encryption,
      { id: "fan-4", content: "nowhere", clock: 10, },
    );
    expect(result,).toEqual({ targets: [], stored: [], stale: [], failed: [], skipped: [], },);
    expect(calls,).toBe(0,);
  });

  test("skips targets whose known capacity cannot fit the payload", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: "https://b.example", state: "trusted", capacityBytes: 4, },);
    await upsertPeer(db, { origin: "https://c.example", state: "trusted", },);
    const attempted: string[] = [];
    const post = (async (url: string,) => {
      attempted.push(url,);
      if (url.endsWith("/api/mesh-reserve",)) {
        return { ok: true, status: 200, body: { reservationId: "r-cap", }, };
      }
      return { ok: true, status: 200, body: { verdict: "stored", }, };
    }) as PeerPost;
    const result = await fanOutContent(
      db,
      post,
      "https://a.example",
      POLICY,
      encryption,
      { id: "fan-5", content: "eleven bytes!", clock: 11, },
    );
    expect(result.skipped,).toHaveLength(1,);
    expect(result.skipped[0]?.origin,).toBe("https://b.example",);
    expect(result.skipped[0]?.reason,).toMatch(/capacity/,);
    expect(attempted.some((url,) => url.startsWith("https://b.example",)),).toBe(false,);
  });
});
