// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for federation discovery + instance-state endpoints.
 *
 * All routes are opt-in via `config.federation.enabled` (default false). When
 * disabled, all federation routes return 404. When enabled, NodeInfo 2.1,
 * well-known discovery, and instance-state are served with no secret leakage.
 */
import { describe, expect, test, } from "bun:test";
import { APP_NAME, APP_VERSION, } from "../config/constants";
import type { Config, FederationConfig, } from "../config/schema";
import type { Db, } from "../db";
import { pskCipher, } from "../federation/cipher";
import { upsertPeer, } from "../federation/coordinator";
import { sealContent, } from "../federation/envelope";
import { createTestDb, } from "../test-utils/create-test-db";
import { federationRoutes, } from "./federation";

const ROUTE_PSK = "route-test-psk";
const routeCipher = pskCipher(ROUTE_PSK,);

function configWith(federation: Partial<FederationConfig>,): Config {
  const fed: FederationConfig = {
    enabled: federation.enabled ?? false,
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

const FED_ENABLED = configWith({ enabled: true, },);

/** Shared migrated db for route tests (distinct content ids per test). */
let sharedDb: Db | null = null;
async function dbFor(): Promise<Db> {
  sharedDb ??= (await createTestDb()).db;
  return sharedDb;
}
/** @param config */
async function appFor(config: Config,) {
  return federationRoutes({ config, database: await dbFor(), },);
}
const FED_DISABLED = configWith({ enabled: false, },);

describe("federationRoutes — gating", () => {
  test("disabled: /.well-known/nodeinfo returns 404", async () => {
    const app = await appFor(FED_DISABLED,);
    const res = await app.handle(new Request("http://localhost/.well-known/nodeinfo",),);
    expect(res.status,).toBe(404,);
  });

  test("disabled: /nodeinfo/2.1 returns 404", async () => {
    const app = await appFor(FED_DISABLED,);
    const res = await app.handle(new Request("http://localhost/nodeinfo/2.1",),);
    expect(res.status,).toBe(404,);
  });

  test("disabled: /api/instance-state returns 404", async () => {
    const app = await appFor(FED_DISABLED,);
    const res = await app.handle(new Request("http://localhost/api/instance-state",),);
    expect(res.status,).toBe(404,);
  });
});

describe("federationRoutes — NodeInfo 2.1", () => {
  test("/.well-known/nodeinfo links to the NodeInfo document", async () => {
    const app = await appFor(FED_ENABLED,);
    const res = await app.handle(new Request("http://localhost/.well-known/nodeinfo",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { links: { rel: string; href: string }[] };
    expect(body.links.length,).toBe(1,);
    const link = body.links[0] ?? { rel: "", href: "", };
    expect(link.rel,).toBe("http://nodeinfo.diaspora.software/ns/schema/2.1",);
    expect(link.href,).toContain("/nodeinfo/2.1",);
  });

  test("publicOrigin overrides the built-in host:port origin", async () => {
    const base = configWith({ enabled: true, },);
    const config = {
      ...base,
      server: { ...base.server, publicOrigin: "https://lore.example.com", },
    } as unknown as Config;
    const app = await appFor(config,);
    const res = await app.handle(new Request("http://localhost/.well-known/nodeinfo",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { links: { rel: string; href: string }[] };
    expect(body.links[0]?.href,).toBe("https://lore.example.com/nodeinfo/2.1",);
  });

  test("/nodeinfo/2.1 returns valid NodeInfo 2.1 document", async () => {
    const app = await appFor(FED_ENABLED,);
    const res = await app.handle(new Request("http://localhost/nodeinfo/2.1",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.version,).toBe("2.1",);
    const software = body.software as { name: string; version: string };
    expect(software.name,).toBe(APP_NAME,);
    expect(software.version,).toBe(APP_VERSION,);
    expect(Array.isArray(body.protocols,),).toBe(true,);
    expect((body.protocols as string[]).includes("activitypub",),).toBe(true,);
    expect(body.openRegistrations,).toBe(false,);
  });

  test("/nodeinfo/2.1 does not leak user counts", async () => {
    const app = await appFor(FED_ENABLED,);
    const res = await app.handle(new Request("http://localhost/nodeinfo/2.1",),);
    const body = (await res.json()) as { usage: { users: unknown } };
    expect(body.usage.users,).toEqual({},);
  });
});

describe("federationRoutes — instance-state", () => {
  test("/api/instance-state returns versioned instance-state", async () => {
    const app = await appFor(FED_ENABLED,);
    const res = await app.handle(new Request("http://localhost/api/instance-state",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.version,).toBe(1,);
    expect(typeof body.instanceId,).toBe("string",);
    const software = body.software as { name: string; version: string };
    expect(software.name,).toBe(APP_NAME,);
    expect(software.version,).toBe(APP_VERSION,);
    expect(Array.isArray(body.protocols,),).toBe(true,);
    expect(typeof body.uptime,).toBe("number",);
    expect(["ok", "degraded",].includes(body.state as string,),).toBe(true,);
  });

  test("/api/instance-state does not leak secrets or user identifiers", async () => {
    const app = await appFor(FED_ENABLED,);
    const res = await app.handle(new Request("http://localhost/api/instance-state",),);
    const body = await res.text();
    expect(body,).not.toMatch(/apiKey|password|secret|token|userId|sessionId/i,);
  });
});

describe("federationRoutes — edge cases", () => {
  test("malformed nodeinfo discovery request (wrong Accept) handled gracefully", async () => {
    const app = await appFor(FED_ENABLED,);
    const res = await app.handle(
      new Request("http://localhost/.well-known/nodeinfo", {
        headers: { accept: "text/plain", },
      },),
    );
    expect([200, 406,],).toContain(res.status,);
  });

  test("instance-state: oversize query string does not crash", async () => {
    const app = await appFor(FED_ENABLED,);
    const huge = "x".repeat(8_192,);
    const res = await app.handle(
      new Request(`http://localhost/api/instance-state?garbage=${huge}`,),
    );
    expect([200, 414,],).toContain(res.status,);
  });

  test("nodeinfo ignores unknown query parameters", async () => {
    const app = await appFor(FED_ENABLED,);
    const res = await app.handle(
      new Request("http://localhost/.well-known/nodeinfo?foo=bar&baz=qux",),
    );
    expect(res.status,).toBe(200,);
  });
});

describe("federationRoutes — mesh-deliver", () => {
  const PSK_CONFIG = configWith({ enabled: true, meshPsk: "route-test-psk", },);

  /** @param body */
  async function postDeliver(
    config: Config,
    body: unknown,
  ): Promise<Response> {
    const app = await appFor(config,);
    return app.handle(
      new Request("http://localhost/api/mesh-deliver", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
  }

  /** @param body */
  async function postReserve(
    config: Config,
    body: unknown,
  ): Promise<Response> {
    const app = await appFor(config,);
    return app.handle(
      new Request("http://localhost/api/mesh-reserve", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
  }

  test("disabled federation returns 404", async () => {
    const res = await postDeliver(FED_DISABLED, { id: "x", },);
    expect(res.status,).toBe(404,);
  });

  test("missing PSK returns 503", async () => {
    const res = await postDeliver(FED_ENABLED, { id: "x", },);
    expect(res.status,).toBe(503,);
  });

  test("malformed envelope returns 400", async () => {
    const res = await postDeliver(PSK_CONFIG, { envelope: { id: "x", }, },);
    expect(res.status,).toBe(400,);
  });

  test("valid envelope stores and verifies (A→B integrity)", async () => {
    const envelope = await sealContent({
      id: "route-content-1",
      origin: "https://a.example",
      content: "cross-server payload",
      cipher: routeCipher,
    },);
    const res = await postDeliver(PSK_CONFIG, { envelope, },);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { verdict: string };
    expect(body.verdict,).toBe("stored",);
    const replay = await postDeliver(PSK_CONFIG, { envelope, },);
    const replayBody = (await replay.json()) as { verdict: string };
    expect(replayBody.verdict,).toBe("stale",);
  });

  test("wrong-PSK envelope returns 400 and records nothing", async () => {
    const envelope = await sealContent({
      id: "route-content-2",
      origin: "https://a.example",
      content: "tampered payload",
      cipher: pskCipher("other-psk",),
    },);
    const res = await postDeliver(PSK_CONFIG, { envelope, },);
    expect(res.status,).toBe(400,);
  });

  test("reserve → deliver confirms the reservation", async () => {
    const db = await dbFor();
    await upsertPeer(db, { origin: "https://route-peer.example", state: "trusted", },);
    const reserve = await postReserve(PSK_CONFIG, {
      senderOrigin: "https://route-peer.example",
      contentHash: "route-hash-1",
      sizeBytes: 18,
    },);
    expect(reserve.status,).toBe(200,);
    const { reservationId, } = (await reserve.json()) as { reservationId: string };
    expect(typeof reservationId,).toBe("string",);
    const envelope = await sealContent({
      id: "route-content-3",
      origin: "https://route-peer.example",
      content: "reserved payload!!",
      cipher: routeCipher,
    },);
    const deliver = await postDeliver(PSK_CONFIG, { envelope, reservationId, },);
    expect(deliver.status,).toBe(200,);
    expect(((await deliver.json()) as { verdict: string }).verdict,).toBe("stored",);
    const row = await db
      .selectFrom("mesh_reservations",)
      .select(["state",],)
      .where("id", "=", reservationId,)
      .executeTakeFirstOrThrow();
    expect(row.state,).toBe("confirmed",);
  });

  test("reserve rejects untrusted peers (403) and exhausted capacity (409)", async () => {
    const db = await dbFor();
    await upsertPeer(db, {
      origin: "https://small-peer.example",
      state: "trusted",
      capacityBytes: 5,
    },);
    const stranger = await postReserve(PSK_CONFIG, {
      senderOrigin: "https://stranger.example",
      contentHash: "x",
      sizeBytes: 1,
    },);
    expect(stranger.status,).toBe(403,);
    const first = await postReserve(PSK_CONFIG, {
      senderOrigin: "https://small-peer.example",
      contentHash: "y",
      sizeBytes: 3,
    },);
    expect(first.status,).toBe(200,);
    const second = await postReserve(PSK_CONFIG, {
      senderOrigin: "https://small-peer.example",
      contentHash: "z",
      sizeBytes: 3,
    },);
    expect(second.status,).toBe(409,);
    const malformed = await postReserve(PSK_CONFIG, { senderOrigin: "x", },);
    expect(malformed.status,).toBe(400,);
  });
});
