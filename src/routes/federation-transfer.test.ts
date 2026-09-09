// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * A→B mesh transfer over real route handlers: Server A seals with the mesh
 * PSK, reserves capacity on B via `/api/mesh-reserve`, pushes via
 * `/api/mesh-deliver`, and B decrypts + verifies. Transport is an in-process
 * `PeerPost` that forwards to B's Elysia app, so every byte passes through
 * the same handlers production uses.
 */
import { describe, expect, test, } from "bun:test";
import type { Config, FederationConfig, } from "../config/schema";
import type { Db, } from "../db";
import { pskCipher, } from "../federation/cipher";
import { upsertPeer, } from "../federation/coordinator";
import { openEnvelope, sealContent, } from "../federation/envelope";
import type { PeerPost, } from "../federation/peer-fetch";
import { pushEnvelope, requestReservation, } from "../federation/sharing";
import { createTestDb, } from "../test-utils/create-test-db";
import { federationRoutes, } from "./federation";

const PSK = "transfer-test-psk";
const A_ORIGIN = "https://a.example";
const B_ORIGIN = "https://b.example";

function configFor(meshPsk: string,): Config {
  const federation: FederationConfig = {
    enabled: true,
    seeds: [],
    peers: [],
    meshPsk,
    duplication: { mode: "trusted", peers: [], },
  };
  return {
    server: { host: "localhost", port: 3000, tls: undefined, },
    auth: { registrationOpen: false, },
    federation,
  } as unknown as Config;
}

type MeshApp = ReturnType<typeof federationRoutes>;

/** @param app */
function postToApp(app: MeshApp,): PeerPost {
  return async (url: string, body: unknown,) => {
    const response = await app.handle(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
    const parsed: unknown = await response.json().catch(() => null);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      body: parsed,
    };
  };
}

describe("A→B mesh transfer", () => {
  test("seal → reserve → push → decrypt verifies integrity", async () => {
    const { db: dbA, } = await createTestDb();
    const { db: dbB, } = await createTestDb();
    await upsertPeer(dbA, { origin: B_ORIGIN, state: "trusted", },);
    await upsertPeer(dbB, {
      origin: A_ORIGIN,
      state: "trusted",
      capacityBytes: 1_000,
    },);
    const appB = federationRoutes({ config: configFor(PSK,), database: dbB satisfies Db, },);
    const postToB = postToApp(appB,);

    const plaintext = "cross-server payload";
    const envelope = await sealContent({
      id: "transfer-1",
      origin: A_ORIGIN,
      clock: 42,
      content: plaintext,
      cipher: pskCipher(PSK,),
    },);

    const reservationId = await requestReservation(postToB, B_ORIGIN, {
      senderOrigin: A_ORIGIN,
      contentHash: envelope.hash,
      sizeBytes: envelope.size,
    },);
    expect(typeof reservationId,).toBe("string",);

    expect(await pushEnvelope(postToB, B_ORIGIN, envelope, reservationId,),).toBe("stored",);

    const stored = await dbB
      .selectFrom("mesh_deliveries",)
      .select(["content_hash", "clock", "origin",],)
      .where("content_id", "=", "transfer-1",)
      .executeTakeFirstOrThrow();
    expect({ ...stored, },).toEqual({
      content_hash: envelope.hash,
      clock: 42,
      origin: A_ORIGIN,
    },);
    const opened = await openEnvelope(envelope, pskCipher(PSK,),);
    expect(new TextDecoder().decode(opened,),).toBe(plaintext,);

    const reservation = await dbB
      .selectFrom("mesh_reservations",)
      .select(["state",],)
      .where("id", "=", reservationId,)
      .executeTakeFirstOrThrow();
    expect(reservation.state,).toBe("confirmed",);
  });

  test("tampered ciphertext is refused and records nothing", async () => {
    const { db: dbB, } = await createTestDb();
    await upsertPeer(dbB, { origin: A_ORIGIN, state: "trusted", },);
    const appB = federationRoutes({ config: configFor(PSK,), database: dbB satisfies Db, },);
    const postToB = postToApp(appB,);

    const envelope = await sealContent({
      id: "transfer-tampered",
      origin: A_ORIGIN,
      content: "secret",
      cipher: pskCipher(PSK,),
    },);
    const bytes = new TextEncoder().encode(envelope.ciphertext,);
    bytes[0] = bytes[0] === 65 ? 66 : 65;
    const tampered = {
      ...envelope,
      ciphertext: new TextDecoder().decode(bytes,),
    };
    await expect(pushEnvelope(postToB, B_ORIGIN, tampered,),).rejects.toThrow(
      "delivery refused",
    );
    const rows = await dbB
      .selectFrom("mesh_deliveries",)
      .select(["content_id",],)
      .where("content_id", "=", "transfer-tampered",)
      .execute();
    expect(rows,).toEqual([],);
  });
});
