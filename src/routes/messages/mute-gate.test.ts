// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mute enforcement (TASK-chat-feature-moderation AC3): inbound gate.
 *
 * Unit level covers the decision table (unmuted participant passes, muted
 * participant gets 403, unknown participant is untouched); the route-level
 * test proves POST /api/chats/:id/messages rejects a muted sender before
 * any side effect (no message row lands).
 *
 * The route suite uses a dynamic-import pristine probe (same shape as
 * __tests__/nsfw-flag-before-access.test.ts): under a shared process an
 * earlier module mock in create.ts's transitive graph can make the import
 * throw — skip rather than fail.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { enforceMuteGate, } from "./guards";

const BASE = "http://localhost";

const createModule: unknown = await import("./create").catch(() => null);
const createPristine = !!createModule &&
  typeof (createModule as Record<string, unknown>).createRoutes === "function";
const { createRoutes, } = (createPristine ? createModule : {}) as typeof import("./create");
const describeRoute = createPristine ? describe : describe.skip;

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

let db: Kysely<DB>;
let ownerId: string;
let chatId: string;

/** Mute an existing participant row for one hour. */
async function muteParticipant(): Promise<void> {
  await db
    .updateTable("chat_participants",)
    .set({ muted_until: new Date(Date.now() + 3_600_000,).toISOString(), },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", ownerId,)
    .execute();
}

/** Clear any mute on the owner's participant row. */
async function unmuteParticipant(): Promise<void> {
  await db
    .updateTable("chat_participants",)
    .set({ muted_until: null, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", ownerId,)
    .execute();
}

describe("enforceMuteGate", () => {
  beforeAll(async () => {
    createLogger({ level: "error", },);
    const created: TestDb = await createTestDb();
    db = created.db;

    ownerId = uid();
    await insertUsers(db, "sender", "Sender", { id: ownerId, } as never,);
    await db
      .insertInto("actors",)
      .values({
        id: ownerId,
        actor_type: "user",
        display_name: "Sender",
        user_id: ownerId,
        owner_id: ownerId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
    chatId = uid();
    await insertChats(db, "Mute Gate Chat", ownerId, { id: chatId, } as never,);
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: ownerId, role_in_chat: "member", },)
      .execute();
  },);

  test("unmuted participant passes (null)", async () => {
    await unmuteParticipant();
    const res = await enforceMuteGate(db, chatId, ownerId,);
    expect(res,).toBeNull();
  });

  test("muted participant is rejected with 403", async () => {
    await muteParticipant();
    const res = await enforceMuteGate(db, chatId, ownerId,);
    expect(res,).not.toBeNull();
    expect(res!.status,).toBe(403,);
    expect(await res!.text(),).toContain("muted",);
  });

  test("unknown participant is untouched (null)", async () => {
    const strangerId = uid();
    const strangerChat = uid();
    await insertChats(db, "No Participants", ownerId, { id: strangerChat, } as never,);
    const res = await enforceMuteGate(db, strangerChat, strangerId,);
    expect(res,).toBeNull();
  });
});

describeRoute("POST /messages mute wiring", () => {
  beforeAll(async () => {
    await unmuteParticipant().catch(() => undefined);
  },);

  function makeApp(): Elysia {
    const app = new Elysia({ name: "test-mute-gate", },);
    app.derive(() => ({ userId: ownerId, userRole: "user", }));
    return app.use(
      createRoutes({ database: db, config: createConfigSchema().defaults as Config, }, "/api",),
    ) as unknown as Elysia;
  }

  test("muted sender is rejected with 403 and no message row lands", async () => {
    await muteParticipant();
    const app = makeApp();
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ content: "hello there", },),
      },),
    );
    expect(res.status,).toBe(403,);
    const rows = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(rows,).toHaveLength(0,);
  });

  test("unmuted sender passes the gate (201 + row)", async () => {
    await unmuteParticipant();
    const app = makeApp();
    const res = await app.handle(
      new Request(`${BASE}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ content: "hello there", },),
      },),
    );
    expect(res.status,).toBe(201,);
    // Only the sender's row is asserted — auto-reply's assistant row is
    // incidental pipeline behavior under default config.
    const userRows = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .where("role", "=", "user",)
      .execute();
    expect(userRows,).toHaveLength(1,);
  });
},);

// File-level: both describes share one db — destroy only after all tests.
afterAll(async () => {
  await db.destroy();
},);
