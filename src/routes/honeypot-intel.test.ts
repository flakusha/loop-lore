// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Config, FederationConfig, } from "../config/schema";
import type { Db, } from "../db";
import { upsertPeer, } from "../federation/coordinator";
import { type IntelFeed, type IntelRecord, signIntelFeed, signIntelPull, } from "../honeypot/intel";
import { listActiveIntel, } from "../honeypot/intel-store";
import { createTestDb, } from "../test-utils/create-test-db";
import { toDate, } from "../utils/date";
import { federationRoutes, } from "./federation";
import { meshIntelEnabled, mountMeshIntelApi, } from "./honeypot-intel";

const PSK = "route-psk";
const PEER_A = "https://a.example";
const PEER_B = "https://b.example";

/**
 * @param federation
 * @returns minimal config for the mounted federation surface
 */
function configWith(federation: Partial<FederationConfig>,): Config {
  const fed: FederationConfig = {
    enabled: federation.enabled ?? true,
    seeds: federation.seeds ?? [],
    peers: federation.peers ?? [],
    meshPsk: federation.meshPsk ?? "",
    duplication: federation.duplication ?? { mode: "trusted", peers: [], },
  };

  return {
    server: { host: "localhost", port: 3000, tls: undefined, },
    auth: { registrationOpen: false, },
    federation: fed,
  } as unknown as Config;
}

/**
 * @returns a record with runtime-relative timestamps
 */
function record(): IntelRecord {
  return {
    action: "report",
    confidence: 0.4,
    createdAt: toDate(Date.now() - 1000,).toISOString(),
    expiresAt: toDate(Date.now() + 60 * 60 * 1000,).toISOString(),
    indicator: "decoy:abcdef1234:suspicion",
    nonce: crypto.randomUUID(),
    sourcePeer: PEER_A,
    type: "suspicion",
  };
}

/**
 * @param db
 * @param path
 * @param body
 */
async function post(db: Db, path: string, body: unknown,): Promise<Response> {
  const app = federationRoutes({ config: configWith({ meshPsk: PSK, },), database: db, },);
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

describe("mesh intel feed", () => {
  test("mountMeshIntelApi registers the feed on a fresh app", async () => {
    const { db, } = await createTestDb();
    try {
      const app = new Elysia();
      mountMeshIntelApi(app, { config: configWith({ meshPsk: PSK, },), database: db, },);
      const res = await app.handle(
        new Request("http://localhost/api/mesh/intel/push", {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: "{}",
        },),
      );

      expect(res.status,).toBe(400,);
    } finally {
      await db.destroy();
    }
  });

  test("kill switch is explicit and opt-out", () => {
    expect(meshIntelEnabled({ HONEYPOT_MESH_INTEL: "0", },),).toBe(false,);
    expect(meshIntelEnabled({},),).toBe(true,);
  });

  test("valid signed push stores an advisory row", async () => {
    const { db, } = await createTestDb();
    try {
      await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
      const entry = record();
      const feed: IntelFeed = { origin: PEER_A, records: [entry,], };
      const res = await post(db, "/api/mesh/intel/push", {
        ...feed,
        proof: await signIntelFeed(PSK, feed,),
      },);

      expect(res.status,).toBe(200,);
      expect(await res.json(),).toMatchObject({ accepted: 1, delisted: 0, duplicates: 0, },);
      const rows = await listActiveIntel(db,);
      expect(rows,).toHaveLength(1,);
      expect(rows[0]?.indicator,).toBe(entry.indicator,);
    } finally {
      await db.destroy();
    }
  });

  test("invalid proof and untrusted origin are refused", async () => {
    const { db, } = await createTestDb();
    try {
      await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
      const feed: IntelFeed = { origin: PEER_A, records: [record(),], };
      const bad = await post(db, "/api/mesh/intel/push", { ...feed, proof: "0".repeat(64,), },);
      expect(bad.status,).toBe(400,);

      const stranger: IntelFeed = { origin: PEER_B, records: [{ ...record(), sourcePeer: PEER_B, },], };
      const forbidden = await post(db, "/api/mesh/intel/push", {
        ...stranger,
        proof: await signIntelFeed(PSK, stranger,),
      },);

      expect(forbidden.status,).toBe(403,);
      expect(await listActiveIntel(db,),).toHaveLength(0,);
    } finally {
      await db.destroy();
    }
  });

  test("delist is scoped to the authenticated peer", async () => {
    const { db, } = await createTestDb();
    try {
      await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
      await upsertPeer(db, { origin: PEER_B, state: "trusted", },);
      const entry = record();
      const feed: IntelFeed = { origin: PEER_A, records: [entry,], };
      expect((await post(db, "/api/mesh/intel/push", { ...feed, proof: await signIntelFeed(PSK, feed,), },)).status,)
        .toBe(200,);

      await db.insertInto("mesh_intel_reports",).values({
        action: "report",
        confidence: 0.4,
        created_at: entry.createdAt,
        expires_at: entry.expiresAt,
        id: crypto.randomUUID(),
        indicator: entry.indicator,
        nonce: crypto.randomUUID(),
        received_at: entry.createdAt,
        source_peer: PEER_B,
        type: "suspicion",
      },).execute();

      const delist: IntelFeed = { origin: PEER_A, records: [{ ...entry, action: "delist", },], };
      const res = await post(db, "/api/mesh/intel/push", {
        ...delist,
        proof: await signIntelFeed(PSK, delist,),
      },);

      expect(res.status,).toBe(200,);
      expect(await res.json(),).toMatchObject({ accepted: 0, delisted: 1, duplicates: 0, },);

      const rows = await listActiveIntel(db,);
      expect(rows,).toHaveLength(1,);
      expect(rows[0]?.sourcePeer,).toBe(PEER_B,);
    } finally {
      await db.destroy();
    }
  });

  test("signed delta pull returns active reports", async () => {
    const { db, } = await createTestDb();
    try {
      await upsertPeer(db, { origin: PEER_A, state: "trusted", },);
      const entry = record();
      const feed: IntelFeed = { origin: PEER_A, records: [entry,], };
      await post(db, "/api/mesh/intel/push", { ...feed, proof: await signIntelFeed(PSK, feed,), },);

      const since = toDate(Date.now() - 2000,).toISOString();
      const body = { origin: PEER_A, since, proof: await signIntelPull(PSK, PEER_A, since,), };
      const res = await post(db, "/api/mesh/intel/pull", body,);
      expect(res.status,).toBe(200,);
      const payload = await res.json() as { records: readonly { indicator: string }[] };
      expect(payload.records,).toHaveLength(1,);
      expect(payload.records[0]?.indicator,).toBe(entry.indicator,);

      const bad = await post(db, "/api/mesh/intel/pull", { ...body, proof: "0".repeat(64,), },);
      expect(bad.status,).toBe(400,);
    } finally {
      await db.destroy();
    }
  });
});
