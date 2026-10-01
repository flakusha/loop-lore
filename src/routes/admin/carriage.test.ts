// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin carriage route tests (TASK-chat-feature-notes-shadow-carriage AC3).
 *
 * Carriage records are visible to admins only: admin 200, non-admin 403,
 * unknown chat 404 — and the participant-facing annotations endpoint never
 * leaks carriage payloads.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { listCarriage, recordCarriage, } from "../../chat/service/carriage";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { annotationRoutes, } from "../chats/annotations";
import { carriageRoutes, } from "./carriage";

const BASE = "http://localhost";
let db: Kysely<DB>;
let adminId: string;
let userId: string;
let chatId: string;
const MARKER = "dev-only-carriage-marker";

/** Build an app whose auth derive reflects the given role. */
function makeApp(role: string, id: string,): Elysia {
  const app = new Elysia({ name: "test-admin-carriage", },);
  app.derive(() => ({ userId: id, userRole: role, }));
  return app.use(
    carriageRoutes({ database: db, config: createConfigSchema().defaults as Config, }, "/api",),
  ) as unknown as Elysia;
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  adminId = crypto.randomUUID();
  userId = crypto.randomUUID();
  await insertUsers(db, "admin", "Admin", { id: adminId, } as never,);
  await insertUsers(db, "member", "Member", { id: userId, } as never,);
  await insertActors(db, "Member", {
    id: userId,
    user_id: userId,
    owner_id: userId,
  } as never,);
  chatId = crypto.randomUUID();
  await insertChats(db, "Carriage Route Chat", adminId, { id: chatId, } as never,);
  await insertChatParticipants(db, chatId, userId, { role_in_chat: "member", },);
  await recordCarriage(db, {
    chatId,
    scope: "session",
    payload: { note: MARKER, },
  },);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("GET /api/admin/chats/:id/carriage", () => {
  test("admin sees carriage records", async () => {
    const app = makeApp("admin", adminId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${chatId}/carriage`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: Array<{ scope: string; payload: string }> };
    expect(body.data,).toHaveLength(1,);
    expect(body.data[0]?.scope,).toBe("session",);
    expect(body.data[0]?.payload,).toContain(MARKER,);
  });

  test("non-admin is forbidden", async () => {
    const app = makeApp("user", userId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${chatId}/carriage`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("unknown chat is a 404", async () => {
    const app = makeApp("admin", adminId,);
    const res = await app.handle(
      new Request(`${BASE}/api/admin/chats/${crypto.randomUUID()}/carriage`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("participant annotations endpoint never carries the payload", async () => {
    const app = new Elysia({ name: "test-annotations-leak", },);
    app.derive(() => ({ userId, userRole: "member", }));
    const wired = app.use(
      annotationRoutes(
        {
          database: db,
          config: createConfigSchema().defaults as Config,
        },
        "/api",
      ),
    ) as unknown as Elysia;
    const res = await wired.handle(
      new Request(`${BASE}/api/chats/${chatId}/annotations`,),
    );
    expect(res.status,).toBe(200,);
    const text = await res.text();
    expect(text,).not.toContain(MARKER,);
    // The carriage row itself exists and is only reachable via listCarriage.
    expect(await listCarriage(db, chatId,),).toHaveLength(1,);
  });
});
