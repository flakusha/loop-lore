// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tranche-1 authoring capability gates at the route layer: character.create,
 * world.create, import.own, export.own/export.any, chat.create. Every endpoint
 * is probed for allow, deny, and missing/invalid principal so a happy-path-only
 * regression cannot hide a deny-closed failure.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { signJwt, } from "../auth/jwt";
import type { Config, } from "../config/schema";
import type { AuthConfig, } from "../config/schema/auth";
import { UserRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertSessions, insertUsers, } from "../test-utils/insert-helpers";
import { createRoutes as characterCreateRoutes, } from "./characters/create";
import { exportRoutes, } from "./characters/export";
import { chatsRoutes, } from "./chats";
import { importRoutes, } from "./import";
import type { HandleOpts, } from "./worlds/types";
import { worldRoutes, } from "./worlds/worlds-routes";

const USER = "00000000-0000-4000-8000-000000000001";
const VIEWER = "00000000-0000-4000-8000-000000000002";
const STRANGER = "00000000-0000-4000-8000-000000000003";
const ACTOR = "00000000-0000-4000-8000-000000000004";
const JWT_SECRET = "test-secret-must-be-at-least-32-chars-long-aaaa";

const authConfig = {
  required: true,
  registrationOpen: false,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 5,
  demoUsername: "demo",
  demoAutoSetup: false,
  jwtSecret: JWT_SECRET,
  legacyOpaqueTokenFallback: false,
} as const satisfies AuthConfig;

const chatConfig = {
  assistant: { enabled: false, },
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
  generation: { providers: { openaiCompatible: [], }, defaultProvider: null, },
  nsfw: { allowNsfw: true, nsfwMinAge: 18, },
} as unknown as Config;

let seq = 0;
/** Wrap a route plugin with the fixed auth context the global derive injects. */
function appWith(plugin: Elysia, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: `rbac-gate-${++seq}`, },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(plugin,) as unknown as Elysia;
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {},): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers, },
    body: JSON.stringify(body,),
  },);
}

/** Signed token backed by a live session row, as the import route requires. */
async function tokenFor(userId: string, role: UserRole,): Promise<string> {
  const sessionId = await insertSessions(
    db,
    userId,
    `hash-${userId}`,
    new Date(Date.now() + 86_400_000,).toISOString(),
  );

  return signJwt({ secret: JWT_SECRET, userId, role, sessionId, expiresInSeconds: 3600, },);
}

async function count(table: "actors" | "chats",): Promise<number> {
  const row = await db.selectFrom(table,).select((eb,) => eb.fn.countAll().as("n",)).executeTakeFirstOrThrow();
  return Number(row.n,);
}

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "gate-user", "Gate User", { id: USER, role: UserRole.User, },);
  await insertUsers(db, "gate-viewer", "Gate Viewer", { id: VIEWER, role: UserRole.Viewer, },);
  await insertUsers(db, "gate-stranger", "Gate Stranger", { id: STRANGER, role: UserRole.User, },);
  await insertActors(db, "Gate Actor", {
    id: ACTOR,
    user_id: USER,
    owner_id: USER,
    visibility: "private",
  },);

  // chats.user_id and chats.participants both reference an actor row.
  await insertActors(db, "Gate Chat Owner", { id: USER, user_id: USER, owner_id: USER, },);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("POST /api/actors — character.create", () => {
  const body = { displayName: "Gate Character", };
  const route = () => characterCreateRoutes({ database: db, },);

  test("user role creates (allow)", async () => {
    const before = await count("actors",);
    const res = await appWith(route(), USER, "user",).handle(
      postJson("http://localhost/api/actors", body,),
    );

    expect(res.status,).toBe(201,);
    expect(await count("actors",),).toBe(before + 1,);
  });

  test("viewer role is denied 403 with no write", async () => {
    const before = await count("actors",);
    const res = await appWith(route(), VIEWER, "viewer",).handle(
      postJson("http://localhost/api/actors", body,),
    );

    expect(res.status,).toBe(403,);
    expect(await count("actors",),).toBe(before,);
  });

  test("missing principal is 401 and null role is 403", async () => {
    const noPrincipal = await appWith(route(), null, "user",).handle(
      postJson("http://localhost/api/actors", body,),
    );

    expect(noPrincipal.status,).toBe(401,);
    const noRole = await appWith(route(), USER, null,).handle(
      postJson("http://localhost/api/actors", body,),
    );

    expect(noRole.status,).toBe(403,);
  });
});

describe("POST /api/worlds — world.create", () => {
  const body = { name: "Gate World", };
  const route = () => worldRoutes({ database: db, config: {} as Config, } as HandleOpts,);

  test("user role creates (allow)", async () => {
    const res = await appWith(route(), USER, "user",).handle(
      postJson("http://localhost/api/worlds", body,),
    );

    expect(res.status,).toBe(201,);
  });

  test("viewer role is denied 403", async () => {
    const res = await appWith(route(), VIEWER, "viewer",).handle(
      postJson("http://localhost/api/worlds", body,),
    );

    expect(res.status,).toBe(403,);
  });

  test("missing principal is 401 and null role is 403", async () => {
    const noPrincipal = await appWith(route(), null, "user",).handle(
      postJson("http://localhost/api/worlds", body,),
    );

    expect(noPrincipal.status,).toBe(401,);
    const noRole = await appWith(route(), USER, null,).handle(
      postJson("http://localhost/api/worlds", body,),
    );

    expect(noRole.status,).toBe(403,);
  });
});

describe("POST /api/actors/import — import.own", () => {
  const route = () => importRoutes({ database: db, config: { auth: authConfig, }, },);
  const card = (): FormData => {
    const fd = new FormData();
    fd.append(
      "file",
      new File(
        [JSON.stringify({
          spec: "chara_card_v2",
          spec_version: "2.0",
          data: { name: "Gate Card", description: "Imported", first_mes: "Hi", },
        },),],
        "gate.json",
        { type: "application/json", },
      ),
    );

    return fd;
  };

  const request = (token: string | null,): Request =>
    new Request("http://localhost/api/actors/import", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}`, } : {},
      body: card(),
    },);

  test("user role imports (allow)", async () => {
    const res = await route().handle(request(await tokenFor(USER, UserRole.User,),),);
    expect(res.status,).toBe(201,);
  });

  test("viewer role is denied 403", async () => {
    const before = await count("actors",);
    const res = await route().handle(request(await tokenFor(VIEWER, UserRole.Viewer,),),);
    expect(res.status,).toBe(403,);
    expect(await count("actors",),).toBe(before,);
  });

  test("missing and invalid credentials are 401", async () => {
    expect((await route().handle(request(null,),)).status,).toBe(401,);
    expect((await route().handle(request("not-a-jwt",),)).status,).toBe(401,);
  });
});

describe("GET /api/actors/:id/export — export.own / export.any", () => {
  const route = () => exportRoutes({ database: db, },);
  const request = (userId: string | null, userRole: string | null, actorId: string,) =>
    appWith(route(), userId, userRole,).handle(
      new Request(`http://localhost/api/actors/${actorId}/export`,),
    );

  test("owner with export.own and admin with export.any are allowed", async () => {
    expect((await request(USER, "user", ACTOR,)).status,).toBe(200,);
    expect((await request(STRANGER, "admin", ACTOR,)).status,).toBe(200,);
  });

  test("owner without export.own is 403; cross-user without export.any is 404", async () => {
    const own = await request(USER, "viewer", ACTOR,);
    expect(own.status,).toBe(403,);
    const cross = await request(STRANGER, "user", ACTOR,);
    expect(cross.status,).toBe(404,);
  });

  test("missing principal cannot export a private actor", async () => {
    expect((await request(null, null, ACTOR,)).status,).toBe(404,);
  });
});

describe("POST /api/chats — chat.create", () => {
  const body = { name: "Gate Chat", };
  const route = () => chatsRoutes({ database: db, config: chatConfig, },);

  test("user role creates (allow)", async () => {
    const before = await count("chats",);
    const res = await appWith(route(), USER, "user",).handle(
      postJson("http://localhost/api/chats", body,),
    );

    expect(res.status,).toBe(201,);
    expect(await count("chats",),).toBe(before + 1,);
  });

  test("viewer role is denied 403 with no write", async () => {
    const before = await count("chats",);
    const res = await appWith(route(), VIEWER, "viewer",).handle(
      postJson("http://localhost/api/chats", body,),
    );

    expect(res.status,).toBe(403,);
    expect(await count("chats",),).toBe(before,);
  });

  test("missing principal is 401 and null role is 403", async () => {
    const noPrincipal = await appWith(route(), null, "user",).handle(
      postJson("http://localhost/api/chats", body,),
    );

    expect(noPrincipal.status,).toBe(401,);
    const noRole = await appWith(route(), USER, null,).handle(
      postJson("http://localhost/api/chats", body,),
    );

    expect(noRole.status,).toBe(403,);
  });
});
