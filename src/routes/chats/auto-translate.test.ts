// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the per-chat auto-translation target.
 *
 * Pins the trust-boundary contract:
 *   - PATCH sets the story_state target and echoes it back.
 *   - PATCH with an unknown code is a 400.
 *   - DELETE clears the target (null echo).
 *   - Non-participants get 403; unknown chats get 404.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { buildTranslateDeps, resolveTargetLang, } from "../../chat/auto-translate";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { autoTranslateRoutes, } from "./auto-translate";

const OWNER_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const CHAT_ID = randomUUID();

/**
 * Build the route app with a fixed session identity injected.
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole: "user", }))
    .use(autoTranslateRoutes({ database: db, config, },),);
}

/**
 * Seed an owner user/actor and an owner-created chat.
 * @param db
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, `out-${OUTSIDER_ID}`, "Outsider", { id: OUTSIDER_ID, } as never,);
  await insertActors(db, "Outsider", { id: OUTSIDER_ID, user_id: OUTSIDER_ID, owner_id: OUTSIDER_ID, } as never,);
  await insertChats(db, "Party", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, },);
}

describe("autoTranslateRoutes", () => {
  test("PATCH sets the target and echoes it back", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "es", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const json = await res.json() as { data: { targetLang: string | null } };
    expect(json.data.targetLang,).toBe("es",);
    const row = await db.selectFrom("chats",).select("story_state",).where("id", "=", CHAT_ID,).executeTakeFirst();
    expect(resolveTargetLang(row?.story_state ?? null,),).toBe("es",);
  });

  test("PATCH with an unknown code is a 400", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "klingon", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("DELETE clears the target", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const app = makeApp(db, OWNER_ID,);
    await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "ja", },),
      },),
    );
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
    const json = await res.json() as { data: { targetLang: string | null } };
    expect(json.data.targetLang,).toBeNull();
  });

  test("non-participant gets 403", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const app = makeApp(db, OUTSIDER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "es", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("unknown chat gets 404", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${randomUUID()}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "es", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("buildTranslateDeps never rejects without a configured provider", async () => {
    const { db, } = await createTestDb();
    const config = createConfigSchema().defaults as Config;
    const deps = await buildTranslateDeps(db, config, OWNER_ID,);
    expect(typeof deps,).toBe("object",);
  });
});
