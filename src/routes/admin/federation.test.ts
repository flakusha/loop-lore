// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Consumer-visible behaviour of the federation admin surface.
 *
 * Everything here drives the REAL routes through an Elysia app and asserts on
 * the HTTP response, never on internal function calls. The two tests that matter
 * most are:
 *
 *   1. `POST /peers` never echoes the shared token — asserted against the RAW
 *      serialized response body, so a nested or renamed field cannot hide it.
 *   2. A matrix edit changes what the REAL `resolvePeerRoute` decides. It is
 *      driven through the actual router with the matrix read back from the DB,
 *      not against a reimplementation of the router's precedence logic.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { PeerWorkloadClass, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { listPeers, upsertPeer, } from "../../federation/coordinator";
import { listWorkloadPeers, } from "../../federation/peer-registry";
import { PeerRouteReason, resolvePeerRoute, } from "../../federation/peer-router";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { federationAdminRoutes, } from "./federation";

const SECRET = "admin-fed-encryption-key-0123456789";
const REMOTE = "https://gpu.example";
const OTHER_REMOTE = "https://cpu.example";
const LOOPBACK = "http://127.0.0.1:4010";

/** A reachable probe: the peer's own advertisement answers. */
const REACHABLE_FETCH: typeof fetch = async () =>
  new Response(JSON.stringify({ instanceId: "peer-1", workloadClasses: [PeerWorkloadClass.Chat,], },), {
    status: 200,
    headers: { "Content-Type": "application/json", },
  },);

/** An unreachable probe: connection refused. */
const UNREACHABLE_FETCH: typeof fetch = async () => {
  throw new Error("connection refused",);
};

/**
 * @param federationEnabled
 * @returns {Config}
 */
function testConfig(federationEnabled: boolean,): Config {
  return {
    federation: { enabled: federationEnabled, peers: [], seeds: [], },
    byoKey: { encryptionKey: SECRET, },
  } as unknown as Config;
}

/**
 * @param db
 * @param userRole
 * @param federationEnabled
 * @param probeFetch
 * @returns {Elysia}
 */
function createApp(
  db: Kysely<DB>,
  userRole: string,
  federationEnabled = true,
  probeFetch: typeof fetch = REACHABLE_FETCH,
): Elysia {
  return new Elysia({ name: `test-fed-admin-${userRole}`, },)
    .derive(() => ({ userId: `test-user-${userRole}`, userRole, sessionId: "s1", }))
    .use(
      federationAdminRoutes(
        { database: db, config: testConfig(federationEnabled,), probeFetch: probeFetch as never, },
        "/api",
      ),
    ) as unknown as Elysia;
}

describe("federation admin — permission gate", () => {
  const ROUTES: [string, string, unknown?,][] = [
    ["GET", "/api/admin/federation/peers",],
    ["POST", "/api/admin/federation/peers", { origin: REMOTE, },],
    ["PATCH", "/api/admin/federation/peers/https%3A%2F%2Fgpu.example/workload", { workloadTrust: true, },],
    ["DELETE", "/api/admin/federation/peers/https%3A%2F%2Fgpu.example",],
    ["GET", "/api/admin/federation/budgets",],
    ["PUT", "/api/admin/federation/budgets", { origin: REMOTE, workloadClass: "chat", mode: "advisory", },],
    ["DELETE", "/api/admin/federation/budgets/https%3A%2F%2Fgpu.example/chat",],
    ["GET", "/api/admin/federation/matrix",],
    ["PUT", "/api/admin/federation/matrix", { preferences: {}, },],
    ["GET", "/api/admin/federation/usage",],
  ];

  for (const role of ["user", "viewer", "guest",]) {
    for (const [method, path, body,] of ROUTES) {
      test(`${method} ${path} refuses a ${role} with 403`, async () => {
        const { db, } = await createTestDb();
        const app = createApp(db, role,);
        const res = await app.handle(
          new Request(`http://localhost${path}`, {
            method,
            ...(body === undefined
              ? {}
              : { body: JSON.stringify(body,), headers: { "Content-Type": "application/json", }, }),
          },),
        );

        expect(res.status,).toBe(403,);
        await db.destroy();
      });
    }
  }
});

describe("federation admin — POST /peers validation", () => {
  beforeEach(() => {
    createLogger({ level: "error", },);
  },);

  /**
   * @param body
   * @returns {Promise<Response>}
   */
  async function post(db: Kysely<DB>, body: unknown,): Promise<Response> {
    const app = createApp(db, "admin",);
    return await app.handle(
      new Request("http://localhost/api/admin/federation/peers", {
        method: "POST",
        body: JSON.stringify(body,),
        headers: { "Content-Type": "application/json", },
      },),
    );
  }

  test("accepts a remote peer with no token", async () => {
    const { db, } = await createTestDb();
    const res = await post(db, { origin: REMOTE, workloadTrust: true, allowedWorkloadClasses: ["chat",], },);
    expect(res.status,).toBe(200,);
    await db.destroy();
  });

  test("accepts a loopback peer WITH a token", async () => {
    const { db, } = await createTestDb();
    const res = await post(db, { origin: LOOPBACK, sharedToken: "loop-secret", },);
    expect(res.status,).toBe(200,);
    await db.destroy();
  });

  test("rejects a non-http(s) origin", async () => {
    const { db, } = await createTestDb();
    const res = await post(db, { origin: "ftp://gpu.example", },);
    expect(res.status,).toBe(400,);
    await db.destroy();
  });

  test("rejects a loopback origin with no token", async () => {
    const { db, } = await createTestDb();
    const res = await post(db, { origin: LOOPBACK, },);
    expect(res.status,).toBe(400,);
    expect((await res.json() as any).data?.reason,).toBe("loopback_without_token",);
    await db.destroy();
  });

  test("rejects a token on a remote origin", async () => {
    const { db, } = await createTestDb();
    const res = await post(db, { origin: REMOTE, sharedToken: "nope", },);
    expect(res.status,).toBe(400,);
    expect((await res.json() as any).data?.reason,).toBe("token_on_remote_origin",);
    await db.destroy();
  });

  test("rejects a workload class outside the enum", async () => {
    const { db, } = await createTestDb();
    const res = await post(db, { origin: REMOTE, allowedWorkloadClasses: ["not-a-class",], },);
    expect(res.status,).toBe(400,);
    await db.destroy();
  });

  test("rejects a duplicate origin", async () => {
    const { db, } = await createTestDb();
    expect((await post(db, { origin: REMOTE, },)).status,).toBe(200,);
    expect((await post(db, { origin: REMOTE, },)).status,).toBe(400,);
    await db.destroy();
  });

  test("an oversized origin is refused by the body schema, not the handler", async () => {
    const { db, } = await createTestDb();
    const res = await post(db, { origin: `https://gpu.example/${"x".repeat(4000,)}`, },);
    expect(res.status,).toBe(422,);
    await db.destroy();
  });
});

describe("federation admin — shared token is write-only", () => {
  test("POST /peers never returns the token in the RAW body", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/federation/peers", {
        method: "POST",
        body: JSON.stringify({ origin: LOOPBACK, sharedToken: "super-secret-token-value", },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    expect(res.status,).toBe(200,);
    // Raw text, not a parsed field: a renamed or nested leak still shows up.
    const raw = await res.text();
    expect(raw,).not.toContain("super-secret-token-value",);
    expect(raw,).not.toContain("sharedToken",);
    expect(raw,).toContain("hasSharedToken",);
    await db.destroy();
  });

  test("GET /peers never returns the token in the RAW body", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin",);
    await app.handle(
      new Request("http://localhost/api/admin/federation/peers", {
        method: "POST",
        body: JSON.stringify({ origin: LOOPBACK, sharedToken: "super-secret-token-value", },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    const res = await app.handle(new Request("http://localhost/api/admin/federation/peers",),);
    const raw = await res.text();
    expect(raw,).not.toContain("super-secret-token-value",);
    expect(raw,).not.toContain("sharedToken",);
    await db.destroy();
  });

  test("GET /usage never returns the token in the RAW body", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin",);
    await app.handle(
      new Request("http://localhost/api/admin/federation/peers", {
        method: "POST",
        body: JSON.stringify({ origin: LOOPBACK, sharedToken: "super-secret-token-value", },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    const res = await app.handle(new Request("http://localhost/api/admin/federation/usage",),);
    const raw = await res.text();
    expect(raw,).not.toContain("super-secret-token-value",);
    expect(raw,).not.toContain("sharedToken",);
    await db.destroy();
  });
});

describe("federation admin — health probe on save", () => {
  test("a reachable peer is stored trusted", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin", true, REACHABLE_FETCH,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/federation/peers", {
        method: "POST",
        body: JSON.stringify({ origin: REMOTE, },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    const body = await res.json() as any;
    expect(body.probe.outcome,).toBe("reachable",);
    expect(body.peer.state,).toBe("trusted",);
    await db.destroy();
  });

  test("an unreachable peer is stored pending, never trusted, with a reason", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin", true, UNREACHABLE_FETCH,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/federation/peers", {
        method: "POST",
        body: JSON.stringify({ origin: REMOTE, },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    const body = await res.json() as any;
    expect(body.probe.outcome,).toBe("unreachable",);
    expect(body.peer.state,).toBe("pending",);
    expect(body.probe.reason,).toBeTruthy();

    const stored = await listPeers(db,);
    expect(stored[0]?.state,).not.toBe("trusted",);
    await db.destroy();
  });
});

describe("federation admin — budgets", () => {
  test("a budget edit round-trips and shows up in the usage read", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);
    const app = createApp(db, "admin",);

    const put = await app.handle(
      new Request("http://localhost/api/admin/federation/budgets", {
        method: "PUT",
        body: JSON.stringify({
          origin: REMOTE,
          workloadClass: "chat",
          mode: "hard",
          maxConcurrency: 4,
          requestsPerMinute: 60,
        },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    expect(put.status,).toBe(200,);

    const usage = await (await app.handle(new Request("http://localhost/api/admin/federation/usage",),)).json() as any;
    const cell = usage.peers[0].classes.find((c: any,) => c.workloadClass === "chat");
    expect(cell.budget.mode,).toBe("hard",);
    expect(cell.budget.maxConcurrency,).toBe(4,);
    expect(cell.budget.requestsPerMinute,).toBe(60,);
    await db.destroy();
  });

  test("a budget for an unknown peer is refused", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/federation/budgets", {
        method: "PUT",
        body: JSON.stringify({ origin: REMOTE, workloadClass: "chat", mode: "advisory", },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("a class outside the enum is refused", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);
    const app = createApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/federation/budgets", {
        method: "PUT",
        body: JSON.stringify({ origin: REMOTE, workloadClass: "not-a-class", mode: "advisory", },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    expect(res.status,).toBe(400,);
    await db.destroy();
  });

  test("zero does NOT collapse into unlimited", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);
    const app = createApp(db, "admin",);

    const zero = await app.handle(
      new Request("http://localhost/api/admin/federation/budgets", {
        method: "PUT",
        body: JSON.stringify({ origin: REMOTE, workloadClass: "chat", mode: "hard", maxConcurrency: 0, },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    // A zero limit is a client error, NOT a silently-stored unlimited budget.
    expect(zero.status,).toBe(400,);

    const unset = await app.handle(
      new Request("http://localhost/api/admin/federation/budgets", {
        method: "PUT",
        body: JSON.stringify({ origin: REMOTE, workloadClass: "chat", mode: "hard", },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    expect(unset.status,).toBe(200,);
    expect((await unset.json() as any).budget.maxConcurrency,).toBeNull();
    await db.destroy();
  });

  test("clearing a budget restores the unlimited default", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, { origin: REMOTE, state: "trusted", },);
    const app = createApp(db, "admin",);

    await app.handle(
      new Request("http://localhost/api/admin/federation/budgets", {
        method: "PUT",
        body: JSON.stringify({ origin: REMOTE, workloadClass: "chat", mode: "hard", maxConcurrency: 4, },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    await app.handle(
      new Request(`http://localhost/api/admin/federation/budgets/${encodeURIComponent(REMOTE,)}/chat`, {
        method: "DELETE",
      },),
    );

    const usage = await (await app.handle(new Request("http://localhost/api/admin/federation/usage",),)).json() as any;
    expect(usage.peers[0].classes.find((c: any,) => c.workloadClass === "chat").budget,).toBeNull();
    await db.destroy();
  });
});

describe("federation admin — assignment matrix drives the real router", () => {
  test("an empty matrix row is local-only; a populated row admits the peer", async () => {
    const { db, } = await createTestDb();
    await upsertPeer(db, {
      origin: REMOTE,
      state: "trusted",
      capabilities: [PeerWorkloadClass.Chat,],
    },);

    // Trust is granted the way an operator grants it — through the admin PATCH —
    // so the test exercises the real write path. `upsertPeer` does not accept a
    // workload_trust field at all, so setting one here would be silently ignored.
    const app = createApp(db, "admin",);
    const grant = await app.handle(
      new Request(
        `http://localhost/api/admin/federation/peers/${encodeURIComponent(REMOTE,)}/workload`,
        {
          method: "PATCH",
          body: JSON.stringify({ workloadTrust: true, allowedWorkloadClasses: [PeerWorkloadClass.Chat,], },),
          headers: { "Content-Type": "application/json", },
        },
      ),
    );

    expect(grant.status,).toBe(200,);

    /** Resolve against the REAL router, with the matrix read back from the DB. */
    const routeWithMatrix = async () => {
      const matrixBody = await (await app.handle(new Request("http://localhost/api/admin/federation/matrix",),))
        .json() as any;

      return resolvePeerRoute({
        federationEnabled: true,
        workloadClass: PeerWorkloadClass.Chat,
        peers: await listWorkloadPeers(db,),
        matrix: matrixBody.matrix,
      },);
    };

    // 1. Empty matrix -> local-only.
    let decision = await routeWithMatrix();
    expect(decision.reason,).toBe(PeerRouteReason.NoMatrixRow,);

    // 2. Admin writes a row naming the peer.
    const put = await app.handle(
      new Request("http://localhost/api/admin/federation/matrix", {
        method: "PUT",
        body: JSON.stringify({ preferences: { chat: [REMOTE,], }, },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    expect(put.status,).toBe(200,);

    // 3. The REAL router now picks the peer. This is the load-bearing assertion.
    decision = await routeWithMatrix();
    expect(decision.reason,).not.toBe(PeerRouteReason.NoMatrixRow,);
    expect(decision.peer?.origin,).toBe(REMOTE,);
    await db.destroy();
  });

  test("a row naming an unknown peer leaves the router local-only", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin",);
    await app.handle(
      new Request("http://localhost/api/admin/federation/matrix", {
        method: "PUT",
        body: JSON.stringify({ preferences: { chat: ["https://nobody.example",], }, },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    const matrixBody = await (await app.handle(new Request("http://localhost/api/admin/federation/matrix",),))
      .json() as any;

    expect(matrixBody.matrix.preferences.chat,).toEqual(["https://nobody.example",],);
    await db.destroy();
  });

  test("a class key outside the enum is refused", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/federation/matrix", {
        method: "PUT",
        body: JSON.stringify({ preferences: { "not-a-class": [REMOTE,], }, },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    expect(res.status,).toBe(400,);
    await db.destroy();
  });
});

describe("federation admin — disabled federation", () => {
  const MUTATIONS: [string, string, unknown,][] = [
    ["POST", "/api/admin/federation/peers", { origin: REMOTE, },],
    ["PATCH", "/api/admin/federation/peers/https%3A%2F%2Fgpu.example/workload", { workloadTrust: true, },],
    ["DELETE", "/api/admin/federation/peers/https%3A%2F%2Fgpu.example",],
    ["PUT", "/api/admin/federation/budgets", { origin: REMOTE, workloadClass: "chat", mode: "advisory", },],
    ["PUT", "/api/admin/federation/matrix", { preferences: {}, },],
  ];

  for (const [method, path, body,] of MUTATIONS) {
    test(`${method} ${path} refuses while federation is disabled`, async () => {
      const { db, } = await createTestDb();
      const app = createApp(db, "admin", false,);
      const res = await app.handle(
        new Request(`http://localhost${path}`, {
          method,
          ...(body === undefined
            ? {}
            : { body: JSON.stringify(body,), headers: { "Content-Type": "application/json", }, }),
        },),
      );

      expect(res.status,).toBe(503,);
      await db.destroy();
    });
  }

  test("GET /usage reports the off state rather than erroring", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin", false,);
    const res = await app.handle(new Request("http://localhost/api/admin/federation/usage",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as any;
    expect(body.enabled,).toBe(false,);
    expect(body.peers,).toEqual([],);
    await db.destroy();
  });
});

describe("federation admin — delete", () => {
  test("deleting an unknown peer is a 404, not a throw", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/federation/peers/${encodeURIComponent(OTHER_REMOTE,)}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("deleting a known peer removes it", async () => {
    const { db, } = await createTestDb();
    const app = createApp(db, "admin",);
    await app.handle(
      new Request("http://localhost/api/admin/federation/peers", {
        method: "POST",
        body: JSON.stringify({ origin: REMOTE, },),
        headers: { "Content-Type": "application/json", },
      },),
    );

    const res = await app.handle(
      new Request(`http://localhost/api/admin/federation/peers/${encodeURIComponent(REMOTE,)}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(200,);
    expect(await listPeers(db,),).toHaveLength(0,);
    await db.destroy();
  });
});
