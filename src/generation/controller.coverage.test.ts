// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route-mount coverage for the generation controller plugin.
 *
 * Drives every route registered by `generationRoutes(...)` through
 * `app.handle(...)` so the arrow bodies (body/params/auth reads) execute.
 * Bodies are intentionally empty so each handler returns at its validation
 * branch — no LLM or network round trip is reachable.
 *
 * A second app mounts the same plugin WITHOUT the auth derive to cover the
 * `auth.userId === undefined` path on every route.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { generationRoutes, } from "./controller";

// No configured providers → provider resolution fails fast (422) and no
// outbound request is ever attempted.
const mockConfig: Config = {
  byoKey: { enabled: false, encryptionKey: null, },
  generation: {
    defaultProvider: null,
    defaultModels: {},
    providers: { openaiCompatible: [], },
  },
} as unknown as Config;

/** Statuses the plugin is allowed to surface through these routes. */
const ALLOWED_STATUSES: number[] = [200, 400, 401, 403, 404, 409, 422, 500,];

interface RouteCase {
  name: string;
  method: "GET" | "POST";
  /** `:chatId` is replaced with the seeded chat id at request time. */
  path: string;
  body?: Record<string, unknown>;
  /** Status expected for the authenticated (derived) app. */
  expected: number;
}

const ROUTES: RouteCase[] = [
  { name: "generate", method: "POST", path: "/api/generation/generate", body: {}, expected: 400, },
  { name: "cancel", method: "POST", path: "/api/generation/cancel", body: {}, expected: 400, },
  { name: "status", method: "GET", path: "/api/generation/status/:chatId", expected: 200, },
  // Unknown chat → access denied before the SSE stream is opened.
  { name: "stream", method: "GET", path: "/api/generation/stream/missing-chat", expected: 403, },
  { name: "active", method: "GET", path: "/api/generation/active", expected: 403, },
  { name: "retry", method: "POST", path: "/api/generation/retry", body: {}, expected: 400, },
  { name: "continue", method: "POST", path: "/api/generation/continue", body: {}, expected: 400, },
  { name: "regenerate", method: "POST", path: "/api/generation/regenerate", body: {}, expected: 400, },
  { name: "image", method: "POST", path: "/api/generation/image", body: {}, expected: 400, },
  { name: "caption", method: "POST", path: "/api/generation/caption", body: {}, expected: 400, },
  { name: "prompt", method: "POST", path: "/api/generation/prompt", body: {}, expected: 400, },
  { name: "test-connection", method: "POST", path: "/api/generation/test-connection", body: {}, expected: 400, },
];

/**
 * @param db
 * @param userId
 */
function createAuthApp(db: Kysely<DB>, userId: string,): Elysia {
  return new Elysia({ name: "test-generation-auth", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(generationRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

/**
 * @param db
 */
function createAnonApp(db: Kysely<DB>,): Elysia {
  return new Elysia({ name: "test-generation-anon", },)
    .use(generationRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

/**
 * @param app
 * @param routeCase
 * @param chatId
 */
async function fire(app: Elysia, routeCase: RouteCase, chatId: string,): Promise<Response> {
  return await app.handle(
    new Request(`http://localhost${routeCase.path.replace(":chatId", chatId,)}`, {
      method: routeCase.method,
      headers: { "content-type": "application/json", },
      body: routeCase.body === undefined ? undefined : JSON.stringify(routeCase.body,),
    },),
  );
}

/**
 * @param res
 */
function assertResponseShape(res: Response,): void {
  expect(res,).toBeInstanceOf(Response,);
  expect(typeof res.status,).toBe("number",);
  expect(ALLOWED_STATUSES,).toContain(res.status,);
}

describe("generationRoutes — plugin route mounting", () => {
  let db: Kysely<DB>;
  let ownerId = "";
  let chatId = "";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = uid();
    chatId = uid();

    await insertUsers(db, `${ownerId}-user`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, actor_type: "user", user_id: ownerId, } as never,);
    await insertChats(db, "Test Chat", ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  for (const routeCase of ROUTES) {
    test(`${routeCase.name} — responds through the plugin (authenticated)`, async () => {
      const app = createAuthApp(db, ownerId,);
      const res = await fire(app, routeCase, chatId,);

      assertResponseShape(res,);
      expect(res.status,).toBe(routeCase.expected,);
    });

    test(`${routeCase.name} — responds with no auth derive`, async () => {
      const app = createAnonApp(db,);
      const res = await fire(app, routeCase, chatId,);

      assertResponseShape(res,);
      expect(res.status,).toBeGreaterThanOrEqual(400,);
    });
  }
});
