// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for chat creation variant wiring.
 *
 * Pins the trust boundary of the optional `variant` field on
 * `POST /api/chats`: an unknown variant is rejected, a supplied triple must
 * agree with `VARIANT_DEFAULTS`, and the variant default is what actually
 * lands in the `chats` row (`type`, `mode`, `gm_config`).
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { VARIANT_DEFAULTS, } from "../../chat/types/variants";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { chatsRoutes, } from "./index";

const testConfig = {
  assistant: { enabled: false, },
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
  generation: { providers: { openaiCompatible: [], }, defaultProvider: null, },
} as unknown as Config;

const USER_ID = "variant-creator";

/** Seed the session user plus its actor row (both are FKs on `chats`). */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, "variant-creator", "Creator", { id: USER_ID, } as never,);
  await insertActors(db, "Creator", { id: USER_ID, user_id: USER_ID, owner_id: USER_ID, } as never,);
}

/**
 * Build the chats plugin with a fixed session identity injected.
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId: string | null,) {
  return new Elysia()
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(chatsRoutes({ database: db, config: testConfig, },),);
}

/** POST a chat-creation body and return the response. */
function postChat(
  app: ReturnType<typeof makeApp>,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** Read the single chat row created by a request. */
async function loadChat(db: Kysely<DB>, name: string,) {
  return await db
    .selectFrom("chats",)
    .select(["type", "mode", "gm_config",],)
    .where("name", "=", name,)
    .executeTakeFirst();
}

describe("chats/create — variant taxonomy wiring", () => {
  test("unauthenticated create is 401 and writes no chat row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postChat(makeApp(db, null,), { name: "No session", },);

    expect(res.status,).toBe(401,);
    expect(await loadChat(db, "No session",),).toBeUndefined();
    await db.destroy();
  });

  test("unknown variant is rejected before any write", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postChat(makeApp(db, USER_ID,), {
      name: "Bad variant",
      variant: "not_a_variant",
    },);

    expect(res.status,).toBe(400,);
    expect(await loadChat(db, "Bad variant",),).toBeUndefined();
    await db.destroy();
  });

  test("variant pins the canonical triple and seeds gm_config", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postChat(makeApp(db, USER_ID,), {
      name: "RPG party",
      variant: "rpg_group",
    },);

    expect(res.status,).toBe(201,);
    const chat = await loadChat(db, "RPG party",);
    const def = VARIANT_DEFAULTS.rpg_group;
    expect(chat?.type,).toBe(def.chat_type,);
    expect(chat?.mode,).toBe(def.chat_mode,);
    expect(JSON.parse(chat!.gm_config!,),).toMatchObject(def.gm_config as object,);
    await db.destroy();
  });

  test("a matching explicit triple is accepted", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const def = VARIANT_DEFAULTS.rpg;
    const res = await postChat(makeApp(db, USER_ID,), {
      name: "RPG solo",
      variant: "rpg",
      type: def.chat_type,
      mode: def.chat_mode,
      purpose: def.chat_purpose,
    },);

    expect(res.status,).toBe(201,);
    const chat = await loadChat(db, "RPG solo",);
    expect(chat?.type,).toBe(def.chat_type,);
    expect(chat?.mode,).toBe(def.chat_mode,);
    await db.destroy();
  });

  test("a conflicting explicit triple is rejected with the expected value", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postChat(makeApp(db, USER_ID,), {
      name: "Conflicting",
      variant: "rpg",
      mode: "direct",
    },);
    const body = await res.json() as { error?: string };

    expect(res.status,).toBe(400,);
    expect(body.error,).toContain("rpg",);
    expect(await loadChat(db, "Conflicting",),).toBeUndefined();
    await db.destroy();
  });

  test("no variant leaves the caller-supplied type and mode intact", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postChat(makeApp(db, USER_ID,), {
      name: "Free chat",
      type: "group",
      mode: "story",
    },);

    expect(res.status,).toBe(201,);
    const chat = await loadChat(db, "Free chat",);
    expect(chat?.type,).toBe("group",);
    expect(chat?.mode,).toBe("story",);
    expect(chat?.gm_config,).toBeNull();
    await db.destroy();
  });
});
