// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: BUG-nsfw-flag-side-effect-runs-before-access-check.
 *
 * POST /api/chats/:id/messages must run the chat-access check BEFORE
 * `flagNsfwUserMessage`. Proving the ordering: if `flagNsfwUserMessage`
 * were ever invoked for a non-participant, the mock's sentinel throw would
 * surface as a 500 — the observed 404 (access rejection) plus a zero-call
 * record of the mock is the fix's observable contract.
 *
 * Requires `--isolate` so `mock.module` rebinds `./nsfw-user-flag` before
 * `../create` loads.
 */
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";

const flagCalls: Array<{ userId: string; chatId: string; content: string }> = [];
mock.module("../../../nsfw/moderation-service", () => {
  return {
    NsfwModerationService: class {
      async recordAction() {/* noop */}
    },
  };
},);
mock.module("../nsfw-user-flag", () => {
  return {
    flagNsfwUserMessage: async (_database: unknown, userId: string, chatId: string, content: string,) => {
      flagCalls.push({ userId, chatId, content, },);
      throw new Error("flagNsfwUserMessage must not run before the access check",);
    },
  };
},);

// Dynamic import (after this file's mock.module calls above) + pristine
// probe: without --isolate, an earlier file's incomplete mock of a module
// in create.ts's transitive graph (e.g. stream-to-client.test.ts stubbing
// cancellation-manager without cancelGenerationByChat) makes the static
// import throw SyntaxError at load. Probe for the real export and skip
// instead of failing (guard shape mirrors the pristine-module probe in
// generation/providers/registry.test.ts).
const createModule: unknown = await import("../create").catch(() => null);
const createPristine = !!createModule &&
  typeof (createModule as Record<string, unknown>).createRoutes === "function";
const { createRoutes, } = (createPristine ? createModule : {}) as typeof import("../create");
const describeReal = createPristine ? describe : describe.skip;

const BASE = "http://localhost";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId: string,): Elysia {
  const app = new Elysia({ name: "test-nsfw-order", },);
  app.derive(() => ({ userId, userRole: "user", }));
  return app.use(
    createRoutes({ database: db, config: {} as never, }, "/api",),
  ) as unknown as Elysia;
}

describeReal("nsfw flag ordering vs chat access (BUG-nsfw-flag-side-effect)", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let outsiderId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await db.insertInto("actors",).values({
      id: ownerId,
      actor_type: "user",
      display_name: "Owner",
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();

    outsiderId = uid();
    await insertUsers(db, "outsider", "Outsider", { id: outsiderId, } as never,);
    await db.insertInto("actors",).values({
      id: outsiderId,
      actor_type: "user",
      display_name: "Outsider",
      user_id: outsiderId,
      owner_id: outsiderId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();

    chatId = uid();
    await insertChats(db, "NSFW Order Chat", ownerId, { id: chatId, } as never,);
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  test("non-participant is access-rejected and flagNsfwUserMessage never runs", async () => {
    const app = makeApp(db, outsiderId,);
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ content: "explicit graphic content", },),
      },),
    );
    // checkChatAccess hides non-member chats as 404.
    expect(res.status,).toBe(404,);
    expect(flagCalls,).toHaveLength(0,);
  });

  test("participant request reaches flagNsfwUserMessage (ordering preserved for authorized callers)", async () => {
    const app = makeApp(db, ownerId,);
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ content: "explicit content", },),
      },),
    );
    // Access passes → flag runs first → mock throws the sentinel → 500.
    expect(res.status,).toBe(500,);
    expect(flagCalls,).toHaveLength(1,);
    expect(flagCalls[0]?.chatId,).toBe(chatId,);
    expect(flagCalls[0]?.userId,).toBe(ownerId,);
  });
},);
