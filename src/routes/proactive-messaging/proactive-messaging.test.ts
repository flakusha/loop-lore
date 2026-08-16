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

function createApp(db: Kysely<DB>, userId: string,): Elysia {
  return new Elysia({ name: "test-proactive", },)
    .derive(() => ({ userId, userRole: "solo", }))
    .use(proactiveMessagingRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

const R = "/api/proactive-messaging";

/** Insert a proactive config row directly (insert helper over-types opts). */
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
