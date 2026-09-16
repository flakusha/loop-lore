// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for `POST /api/chats/:id/moderate`.
 *
 * Pins the HTTP boundary of the ban / kick / mute / flag primitives:
 * identity comes from the session (`requireUserId`), authority from
 * `checkChatSettingsAccess`, and the failure modes stay distinguishable
 * (401 unauthenticated vs 403 unauthorized vs 400 primitive rejection).
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { moderationRoutes, } from "./moderation";

const OWNER_ID = "u-owner";
const MEMBER_ID = "u-member";
const TARGET_ID = "u-target";
const CHAT_ID = "chat-moderation-route";

/** Build the moderation route app with a fixed session identity injected. */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "user",) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole, }))
    .use(moderationRoutes({ database: db, config, },),);
}

/** Seed an owner-created chat with a member participant to act on. */
async function seed(db: Kysely<DB>,): Promise<void> {
  for (const id of [OWNER_ID, MEMBER_ID, TARGET_ID,]) {
    await insertUsers(db, `name-${id}`, id, { id, } as never,);
    await insertActors(db, id, { id, user_id: id, owner_id: id, } as never,);
  }
  await insertChats(db, "Moderated", OWNER_ID, {
    id: CHAT_ID,
    type: "group",
    mode: "group",
  } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: "owner", } as never,);
  await insertChatParticipants(db, CHAT_ID, TARGET_ID, { role_in_chat: "member", } as never,);
}

/** POST a moderation body through the route app. */
function post(app: ReturnType<typeof makeApp>, body: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/api/chats/${CHAT_ID}/moderate`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** Count audit rows written for the target actor. */
async function auditCount(db: Kysely<DB>, kind?: string,) {
  let q = db
    .selectFrom("log_entries",)
    .select("id",)
    .where("entity_id", "=", TARGET_ID,);
  if (kind) { q = q.where("action", "=", kind as never,); }
  return (await q.execute()).length;
}

describe("moderationRoutes — identity, authority, dispatch", () => {
  test("unauthenticated request is 401 and writes no audit row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await post(makeApp(db, null,), { action: "mute", targetActorId: TARGET_ID, },);

    expect(res.status,).toBe(401,);
    expect(await auditCount(db,),).toBe(0,);
    await db.destroy();
  });

  test("plain member is 403 and writes no audit row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await post(makeApp(db, MEMBER_ID,), {
      action: "ban",
      targetActorId: TARGET_ID,
    },);

    expect(res.status,).toBe(403,);
    expect(await auditCount(db,),).toBe(0,);
    await db.destroy();
  });

  test("unknown chat is 403 for an authenticated non-admin", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/does-not-exist/moderate", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ action: "mute", targetActorId: TARGET_ID, },),
      },),
    );

    expect(res.status,).toBe(403,);
    await db.destroy();
  });

  test("owner ban stamps banned_until and returns the audit entry id", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await post(makeApp(db, OWNER_ID,), {
      action: "ban",
      targetActorId: TARGET_ID,
      reason: "spam",
      durationMs: 60_000,
    },);
    const body = await res.json() as { ok: boolean; auditEntryId?: string };

    expect(res.status,).toBe(200,);
    expect(body.ok,).toBe(true,);
    expect(body.auditEntryId,).toBeTruthy();

    const participant = await db
      .selectFrom("chat_participants",)
      .select("banned_until",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", TARGET_ID,)
      .executeTakeFirst();
    expect(participant?.banned_until,).not.toBeNull();
    expect(await auditCount(db, "ban",),).toBe(1,);
    await db.destroy();
  });

  test("self-ban is a 400 primitive rejection", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await post(makeApp(db, OWNER_ID,), {
      action: "ban",
      targetActorId: OWNER_ID,
    },);

    expect(res.status,).toBe(400,);
    expect(await auditCount(db,),).toBe(0,);
    await db.destroy();
  });

  test("owner kick removes the participant row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await post(makeApp(db, OWNER_ID,), {
      action: "kick",
      targetActorId: TARGET_ID,
    },);

    expect(res.status,).toBe(200,);
    const rows = await db
      .selectFrom("chat_participants",)
      .select("actor_id",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", TARGET_ID,)
      .execute();
    expect(rows,).toHaveLength(0,);
    expect(await auditCount(db, "kick",),).toBe(1,);
    await db.destroy();
  });

  test("mute honours an explicit duration", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await post(makeApp(db, OWNER_ID,), {
      action: "mute",
      targetActorId: TARGET_ID,
      durationMs: 120_000,
    },);

    expect(res.status,).toBe(200,);
    const participant = await db
      .selectFrom("chat_participants",)
      .select("muted_until",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", TARGET_ID,)
      .executeTakeFirst();
    const remaining = Date.parse(participant!.muted_until!,) - Date.now();
    expect(remaining,).toBeGreaterThan(60_000,);
    expect(remaining,).toBeLessThanOrEqual(120_000,);
    await db.destroy();
  });

  test("mute without a duration falls back to the 1h default", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await post(makeApp(db, OWNER_ID,), {
      action: "mute",
      targetActorId: TARGET_ID,
    },);

    expect(res.status,).toBe(200,);
    const participant = await db
      .selectFrom("chat_participants",)
      .select("muted_until",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", TARGET_ID,)
      .executeTakeFirst();
    const remaining = Date.parse(participant!.muted_until!,) - Date.now();
    expect(remaining,).toBeGreaterThan(50 * 60_000,);
    await db.destroy();
  });

  test("flag-nsfw and flag-tox both record the matching audit kind", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OWNER_ID,);
    const nsfw = await post(app, {
      action: "flag-nsfw",
      targetActorId: TARGET_ID,
      content: "explicit content sample",
    },);
    const tox = await post(app, { action: "flag-tox", targetActorId: TARGET_ID, },);

    expect(nsfw.status,).toBe(200,);
    expect(tox.status,).toBe(200,);
    expect(await auditCount(db, "flag-nsfw",),).toBe(1,);
    expect(await auditCount(db, "flag-tox",),).toBe(1,);
    await db.destroy();
  });
});
