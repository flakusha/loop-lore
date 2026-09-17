// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for proactive messaging.
 *
 * Verifies the end-to-end trigger contract: `send` only fires when due and
 * then records the send (advancing `last_proactive_at` + emitting a
 * notification), returns 409 when no config/not due, and `backoff` increments
 * the anti-spam counter.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { proactiveMessagingRoutes, } from "./index";

// Config shaped so `triggerAutoGeneration` bails early (no providers) — the
// send route still exercises check -> recordSent -> notification orchestration
// without an LLM round-trip.
const mockConfig: Config = {
  generation: { defaultProvider: null, providers: { openaiCompatible: [], }, },
} as unknown as Config;

/**
 * @param db
 * @param userId
 */
function createApp(db: Kysely<DB>, userId: string,): Elysia {
  return new Elysia({ name: "test-proactive", },)
    .derive(() => ({ userId, userRole: "solo", }))
    .use(proactiveMessagingRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

/**
 * Same app wiring as `createApp` but with a plain `user` role (no
 * `admin.character` / `admin.chat` bypass) — required to exercise the
 * `authorizeProactiveTarget` / `checkChatAccess` rejection branches.
 * @param db
 * @param userId
 */
function createOutsiderApp(db: Kysely<DB>, userId: string,): Elysia {
  return new Elysia({ name: "test-proactive-outsider", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(proactiveMessagingRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

const R = "/api/proactive-messaging";

/**
 * Insert a proactive config row directly (insert helper over-types opts).
 * @param db
 * @param chatId
 * @param actorId
 * @param opts
 * @param opts.frequency
 * @param opts.enabled
 * @param opts.backoffCount
 * @param opts.lastProactiveAt
 */
async function insertConfig(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  opts: {
    frequency: string;
    enabled: number;
    backoffCount?: number;
    lastProactiveAt?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db.insertInto("proactive_messaging_config",).values({
    id: crypto.randomUUID(),
    chat_id: chatId,
    actor_id: actorId,
    frequency: opts.frequency,
    quiet_hours_start: null,
    quiet_hours_end: null,
    enabled: opts.enabled,
    last_proactive_at: opts.lastProactiveAt ?? null,
    backoff_count: opts.backoffCount ?? 0,
    config_json: "{}",
    created_at: now,
    updated_at: now,
  },).execute();
}

describe("proactiveMessagingRoutes — trigger contract", () => {
  let db: Kysely<DB>;
  let userId: string;
  let actorId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    userId = uid();
    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "Test User",
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();

    actorId = uid();
    await db.insertInto("actors",).values({
      id: actorId,
      actor_type: "character",
      display_name: "Proactive Character",
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      settings: "{}",
      import_spec: "{}",
    },).execute();

    chatId = uid();
    await db.insertInto("chats",).values({
      id: chatId,
      name: "Test Chat",
      type: "direct",
      mode: "direct",
      created_by: userId,
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("send returns 409 when no proactive config exists", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost${R}/send?chatId=${chatId}&actorId=${actorId}`, {
        method: "POST",
      },),
    );
    expect(res.status,).toBe(409,);
  });

  test("backoff increments the anti-spam counter", async () => {
    const app = createApp(db, userId,);
    await insertConfig(db, chatId, actorId, {
      frequency: "normal",
      enabled: 1,
      backoffCount: 2,
    },);

    const res = await app.handle(
      new Request(`http://localhost${R}/backoff?chatId=${chatId}&actorId=${actorId}`, {
        method: "POST",
      },),
    );
    expect(res.status,).toBe(200,);

    const row = await db
      .selectFrom("proactive_messaging_config",)
      .select("backoff_count",)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();
    expect(row.backoff_count,).toBe(3,);
  });

  test("send fires when due, records the send, and emits a notification", async () => {
    const app = createApp(db, userId,);

    const targetChat = uid();
    await db.insertInto("chats",).values({
      id: targetChat,
      name: "Target Chat",
      type: "direct",
      mode: "direct",
      created_by: userId,
    },).execute();

    // Enabled, very-frequent (1h), last send 10 hours ago -> due.
    await insertConfig(db, targetChat, actorId, {
      frequency: "very_frequent",
      enabled: 1,
      lastProactiveAt: new Date(Date.now() - 10 * 60 * 60 * 1000,).toISOString(),
    },);

    const res = await app.handle(
      new Request(`http://localhost${R}/send?chatId=${targetChat}&actorId=${actorId}`, {
        method: "POST",
      },),
    );
    expect(res.status,).toBe(200,);

    const body = (await res.json()) as { triggered: boolean };
    expect(body.triggered,).toBe(true,);

    // last_proactive_at advanced (send recorded -> next wait restarts).
    const row = await db
      .selectFrom("proactive_messaging_config",)
      .select("last_proactive_at",)
      .where("chat_id", "=", targetChat,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();
    expect(row.last_proactive_at,).not.toBeNull();

    // A system notification for the user was created.
    const notif = await db
      .selectFrom("notifications",)
      .select("id",)
      .where("user_id", "=", userId,)
      .where("type", "=", "system",)
      .executeTakeFirst();
    expect(notif,).toBeDefined();
  });

  test("send returns 409 when the frequency interval has not elapsed", async () => {
    const app = createApp(db, userId,);

    const recentChat = uid();
    await db.insertInto("chats",).values({
      id: recentChat,
      name: "Recent Chat",
      type: "direct",
      mode: "direct",
      created_by: userId,
    },).execute();

    // Enabled, normal (1/day), last send 1 minute ago -> not due.
    await insertConfig(db, recentChat, actorId, {
      frequency: "normal",
      enabled: 1,
      lastProactiveAt: new Date(Date.now() - 60 * 1000,).toISOString(),
    },);

    const res = await app.handle(
      new Request(`http://localhost${R}/send?chatId=${recentChat}&actorId=${actorId}`, {
        method: "POST",
      },),
    );
    expect(res.status,).toBe(409,);
  });
});

describe("proactive messaging — CRUD/check/record endpoints", () => {
  let db: Kysely<DB>;
  let userId: string;
  let otherUserId: string;
  let actorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    userId = uid();
    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "CRUD User",
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();

    otherUserId = uid();
    await db.insertInto("users",).values({
      id: otherUserId,
      username: `user-${otherUserId}`,
      display_name: "Outsider",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    actorId = uid();
    await db.insertInto("actors",).values({
      id: actorId,
      actor_type: "character",
      display_name: "CRUD Character",
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      settings: "{}",
      import_spec: "{}",
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /** Fresh chat created by `userId` so the participant passes chat access. */
  async function makeChat(): Promise<string> {
    const id = uid();
    await db.insertInto("chats",).values({
      id,
      name: "CRUD Chat",
      type: "direct",
      mode: "direct",
      created_by: userId,
    },).execute();
    return id;
  }

  test("GET /config returns the stored row for a participant", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();
    await insertConfig(db, chat, actorId, { frequency: "frequent", enabled: 1, },);

    const res = await app.handle(
      new Request(`http://localhost${R}/config?chatId=${chat}&actorId=${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      chatId: string;
      actorId: string;
      frequency: string;
      enabled: boolean;
    };
    expect(body.chatId,).toBe(chat,);
    expect(body.actorId,).toBe(actorId,);
    expect(body.frequency,).toBe("frequent",);
    expect(body.enabled,).toBe(true,);
  });

  test("GET /config returns null when no config exists", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();

    const res = await app.handle(
      new Request(`http://localhost${R}/config?chatId=${chat}&actorId=${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    expect(await res.json(),).toBeNull();
  });

  test("GET /configs lists configs for a participant", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();
    await insertConfig(db, chat, actorId, { frequency: "infrequent", enabled: 1, },);

    const res = await app.handle(
      new Request(`http://localhost${R}/configs?chatId=${chat}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Array<{ chatId: string; frequency: string }>;
    expect(body.length,).toBe(1,);
    const [first,] = body;
    expect(first?.chatId,).toBe(chat,);
    expect(first?.frequency,).toBe("infrequent",);
  });

  test("GET /configs rejects a non-participant with 404", async () => {
    const app = createOutsiderApp(db, otherUserId,);
    const chat = await makeChat();

    const res = await app.handle(
      new Request(`http://localhost${R}/configs?chatId=${chat}`,),
    );
    expect(res.status,).toBe(404,);
    const body = (await res.json()) as { error: string };
    expect(body.error,).toBe("Chat not found",);
  });

  test("PUT /config creates a row for a participant", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();

    const res = await app.handle(
      new Request(`http://localhost${R}/config?chatId=${chat}&actorId=${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ frequency: "frequent", enabled: false, configJson: { dailyLimit: 2, }, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      frequency: string;
      enabled: boolean;
      configJson: Record<string, unknown>;
    };
    expect(body.frequency,).toBe("frequent",);
    expect(body.enabled,).toBe(false,);
    expect(body.configJson,).toEqual({ dailyLimit: 2, },);

    const row = await db
      .selectFrom("proactive_messaging_config",)
      .select(["frequency", "enabled",],)
      .where("chat_id", "=", chat,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();
    expect(row.frequency,).toBe("frequent",);
    expect(row.enabled,).toBe(0,);
  });

  test("PUT /config updates an existing row", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();
    await insertConfig(db, chat, actorId, { frequency: "normal", enabled: 1, },);

    const res = await app.handle(
      new Request(`http://localhost${R}/config?chatId=${chat}&actorId=${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ frequency: "infrequent", },),
      },),
    );
    expect(res.status,).toBe(200,);

    const row = await db
      .selectFrom("proactive_messaging_config",)
      .select(["frequency", "enabled",],)
      .where("chat_id", "=", chat,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();
    expect(row.frequency,).toBe("infrequent",);
    expect(row.enabled,).toBe(1,);
  });

  test("PUT /config rejects a body violating configBody with 422", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();

    const res = await app.handle(
      new Request(`http://localhost${R}/config?chatId=${chat}&actorId=${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ frequency: "every_second", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("GET /check returns the check result shape for a participant", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();
    await insertConfig(db, chat, actorId, { frequency: "very_frequent", enabled: 1, },);

    const res = await app.handle(
      new Request(`http://localhost${R}/check?chatId=${chat}&actorId=${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      shouldMessage: boolean;
      reason: string;
      config: { chatId: string } | null;
    };
    expect(body.shouldMessage,).toBe(true,);
    expect(body.reason,).toBe("Ready to send proactive message",);
    expect(body.config?.chatId,).toBe(chat,);
  });

  test("POST /record-sent advances last_proactive_at and resets backoff", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();
    await insertConfig(db, chat, actorId, {
      frequency: "normal",
      enabled: 1,
      backoffCount: 3,
      lastProactiveAt: null,
    },);

    const res = await app.handle(
      new Request(`http://localhost${R}/record-sent?chatId=${chat}&actorId=${actorId}`, {
        method: "POST",
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    const row = await db
      .selectFrom("proactive_messaging_config",)
      .select(["last_proactive_at", "backoff_count",],)
      .where("chat_id", "=", chat,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();
    expect(row.last_proactive_at,).not.toBeNull();
    expect(row.backoff_count,).toBe(0,);
  });

  test("POST /reset-backoff clears the backoff counter for a participant", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();
    await insertConfig(db, chat, actorId, { frequency: "normal", enabled: 1, backoffCount: 4, },);

    const res = await app.handle(
      new Request(`http://localhost${R}/reset-backoff?chatId=${chat}&actorId=${actorId}`, {
        method: "POST",
      },),
    );
    expect(res.status,).toBe(200,);
    expect(((await res.json()) as { ok: boolean }).ok,).toBe(true,);

    const row = await db
      .selectFrom("proactive_messaging_config",)
      .select("backoff_count",)
      .where("chat_id", "=", chat,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();
    expect(row.backoff_count,).toBe(0,);
  });

  test("DELETE /config removes the row and reports deletion state", async () => {
    const app = createApp(db, userId,);
    const chat = await makeChat();
    await insertConfig(db, chat, actorId, { frequency: "normal", enabled: 1, },);

    const first = await app.handle(
      new Request(`http://localhost${R}/config?chatId=${chat}&actorId=${actorId}`, {
        method: "DELETE",
      },),
    );
    expect(first.status,).toBe(200,);
    expect(((await first.json()) as { deleted: boolean }).deleted,).toBe(true,);

    const row = await db
      .selectFrom("proactive_messaging_config",)
      .select("id",)
      .where("chat_id", "=", chat,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();

    const second = await app.handle(
      new Request(`http://localhost${R}/config?chatId=${chat}&actorId=${actorId}`, {
        method: "DELETE",
      },),
    );
    expect(second.status,).toBe(200,);
    expect(((await second.json()) as { deleted: boolean }).deleted,).toBe(false,);
  });

  test("outsiders are rejected on every authorizeProactiveTarget endpoint", async () => {
    const app = createOutsiderApp(db, otherUserId,);
    const chat = await makeChat();
    const json = JSON.stringify({ frequency: "normal", },);
    const cases: Array<{ method: string; path: string; body?: string }> = [
      { method: "GET", path: `${R}/config?chatId=${chat}&actorId=${actorId}`, },
      { method: "PUT", path: `${R}/config?chatId=${chat}&actorId=${actorId}`, body: json, },
      { method: "GET", path: `${R}/check?chatId=${chat}&actorId=${actorId}`, },
      { method: "POST", path: `${R}/record-sent?chatId=${chat}&actorId=${actorId}`, },
      { method: "POST", path: `${R}/reset-backoff?chatId=${chat}&actorId=${actorId}`, },
      { method: "POST", path: `${R}/backoff?chatId=${chat}&actorId=${actorId}`, },
      { method: "DELETE", path: `${R}/config?chatId=${chat}&actorId=${actorId}`, },
    ];

    for (const c of cases) {
      const res = await app.handle(
        new Request(`http://localhost${c.path}`, {
          method: c.method,
          headers: c.body ? { "content-type": "application/json", } : undefined,
          body: c.body,
        },),
      );
      expect(res.status,).toBe(404,);
      const body = (await res.json()) as { error: string };
      expect(body.error,).toBe("Actor not found",);
    }
  });
});
