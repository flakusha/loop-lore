// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for unread/visible-message counters in the consolidated baseline
 * (trigger behavior, maintained-vs-grouped equivalence, reconcile self-heal)
 * and the O(1) mark-read reset in the chats-extras route.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { type Kysely, sql, } from "kysely";
import { runUnreadReconcile, } from "../chat/service/unread-reconcile";
import { createLogger, } from "../logger";
import { extrasRoutes, } from "../routes/chats/extras";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { MessageRole, } from "./enums";
import type { DB, } from "./schema";

/** Per-test chat fixture with two participants. */
interface ChatFixture {
  chatId: string;
  userA: string;
  userB: string;
}

/** Counts visible messages per chat from the source table. */
async function visibleCount(db: Kysely<DB>, chatId: string,): Promise<number> {
  const row = await db
    .selectFrom("messages",)
    .select((eb,) => eb.fn.countAll<number>().as("count",))
    .where("chat_id", "=", chatId,)
    .where("visibility", "=", "visible",)
    .executeTakeFirst();

  return row?.count ?? 0;
}

/** Recomputes the interim-aggregation unread predicate for one participant. */
async function expectedUnread(db: Kysely<DB>, chatId: string, actorId: string,): Promise<number> {
  const p = await db
    .selectFrom("chat_participants",)
    .select(["last_read_message_id",],)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  const rows = await db
    .selectFrom("messages",)
    .select(["created_at",],)
    .where("chat_id", "=", chatId,)
    .where("visibility", "=", "visible",)
    .execute();

  const lastRead = p?.last_read_message_id
    ? await db.selectFrom("messages",).select(["created_at",],).where("id", "=", p.last_read_message_id,)
      .executeTakeFirst()
    : undefined;

  return rows.filter((m,) => !lastRead || m.created_at > lastRead.created_at).length;
}

describe("unread/visible counters (consolidated baseline)", () => {
  let db: Kysely<DB>;

  const mkUser = async (name: string,): Promise<string> => {
    const id = uid();
    await db.insertInto("users",).values({
      id,
      username: name,
      display_name: name,
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();

    await db.insertInto("actors",).values({
      id,
      actor_type: "user",
      display_name: name,
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();

    return id;
  };

  /** Fresh chat + two participants (fresh per test: no cross-test drift). */
  const mkChat = async (): Promise<ChatFixture> => {
    const userA = await mkUser(`a-${uid().slice(0, 8,)}`,);
    const userB = await mkUser(`b-${uid().slice(0, 8,)}`,);
    const chatId = uid();
    await db.insertInto("chats",).values({ id: chatId, name: "c", type: "direct", mode: "direct", created_by: userA, },)
      .execute();

    await db.insertInto("chat_participants",).values({ chat_id: chatId, actor_id: userA, },).execute();
    await db.insertInto("chat_participants",).values({ chat_id: chatId, actor_id: userB, },).execute();
    return { chatId, userA, userB, };
  };

  const counters = async (
    f: ChatFixture,
    actor: string,
  ): Promise<{ unread: number | null; watermark: string | null; visible: number }> => {
    const p = await db.selectFrom("chat_participants",).select(["unread_count", "last_read_created_at",],)
      .where("chat_id", "=", f.chatId,).where("actor_id", "=", actor,).executeTakeFirst();

    const c = await db.selectFrom("chats",).select(["visible_message_count",],).where("id", "=", f.chatId,)
      .executeTakeFirst();

    return {
      unread: p?.unread_count ?? null,
      watermark: p?.last_read_created_at ?? null,
      visible: c?.visible_message_count ?? 0,
    };
  };

  const insertMsg = async (
    f: ChatFixture,
    opts: { createdAt: string; visibility?: string; id?: string },
  ): Promise<string> => {
    const id = opts.id ?? uid();
    await db.insertInto("messages",).values({
      id,
      chat_id: f.chatId,
      actor_id: f.userA,
      role: MessageRole.User,
      content: "m",
      created_at: opts.createdAt,
      visibility: opts.visibility ?? "visible",
    } as never,).execute();

    return id;
  };

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("visible insert increments; hidden insert does not", async () => {
    const f = await mkChat();
    await insertMsg(f, { createdAt: "2026-01-01T00:00:01Z", },);
    await insertMsg(f, { createdAt: "2026-01-01T00:00:02Z", visibility: "hidden_by_user", },);
    await insertMsg(f, { createdAt: "2026-01-01T00:00:03Z", },);
    const c = await counters(f, f.userA,);
    expect(c.visible,).toBe(2,);
    expect(c.unread,).toBe(2,); // NULL watermark counts all visible
    expect((await counters(f, f.userB,)).unread,).toBe(2,);
  });

  test("read-marker reset zeroes and gates future increments", async () => {
    const f = await mkChat();
    await insertMsg(f, { createdAt: "2026-01-01T00:00:01Z", },);
    await insertMsg(f, { createdAt: "2026-01-01T00:00:03Z", },);
    // Same statement shape the mark-read route issues.
    await db.updateTable("chat_participants",).set({
      last_read_message_id: f.chatId &&
        (await db.selectFrom("messages",).select("id",).where("chat_id", "=", f.chatId,).orderBy("created_at", "desc",)
          .limit(1,).executeTakeFirst())!.id,
      last_read_created_at: "2026-01-01T00:00:03Z",
      unread_count: 0,
    },).where("chat_id", "=", f.chatId,).where("actor_id", "=", f.userA,).execute();

    expect((await counters(f, f.userA,)).unread,).toBe(0,);

    await insertMsg(f, { createdAt: "2026-01-01T00:00:04Z", },);
    expect((await counters(f, f.userA,)).unread,).toBe(1,); // newer than watermark
    expect((await counters(f, f.userB,)).unread,).toBe(3,); // never read
  });

  test("visibility flip applies both arms", async () => {
    const f = await mkChat();
    await insertMsg(f, { createdAt: "2026-01-01T00:00:01Z", },);
    const id = await insertMsg(f, { createdAt: "2026-01-01T00:00:05Z", },);
    // Mark userA caught-up at 00:05 so the flip arms are observable per participant.
    await db.updateTable("chat_participants",).set({
      last_read_created_at: "2026-01-01T00:00:05Z",
      last_read_message_id: id,
      unread_count: 0,
    },).where("chat_id", "=", f.chatId,).where("actor_id", "=", f.userA,).execute();

    expect((await counters(f, f.userA,)).visible,).toBe(2,);
    await db.updateTable("messages",).set({ visibility: "hidden_by_user", },).where("id", "=", id,).execute();
    expect((await counters(f, f.userA,)).visible,).toBe(1,);
    expect((await counters(f, f.userA,)).unread,).toBe(0,); // 00:05 was read by A; nothing to decrement
    expect((await counters(f, f.userB,)).unread,).toBe(1,); // 00:01 still unread for B
    await db.updateTable("messages",).set({ visibility: "visible", },).where("id", "=", id,).execute();
    expect((await counters(f, f.userA,)).visible,).toBe(2,);
    expect((await counters(f, f.userA,)).unread,).toBe(0,);
    expect((await counters(f, f.userB,)).unread,).toBe(2,);
  });

  test("delete decrements and clamps at 0", async () => {
    const f = await mkChat();
    const id = await insertMsg(f, { createdAt: "2026-01-01T00:00:06Z", },);
    expect((await counters(f, f.userA,)).visible,).toBe(1,);
    await db.deleteFrom("messages",).where("id", "=", id,).execute();
    expect((await counters(f, f.userA,)).visible,).toBe(0,);
    expect((await counters(f, f.userA,)).unread,).toBe(0,);
    expect((await counters(f, f.userB,)).unread,).toBe(0,);
    // Clamp: counter already below the truthful count must never go negative.
    await db.updateTable("chat_participants",).set({ unread_count: 0, },).where("chat_id", "=", f.chatId,).execute();
    const id2 = await insertMsg(f, { createdAt: "2026-01-01T00:00:07Z", },);
    expect((await counters(f, f.userB,)).unread,).toBe(1,);
    await db.updateTable("chat_participants",).set({ unread_count: 0, },).where("chat_id", "=", f.chatId,).where(
      "actor_id",
      "=",
      f.userB,
    ).execute();

    await db.deleteFrom("messages",).where("id", "=", id2,).execute();
    expect((await counters(f, f.userB,)).unread,).toBe(0,); // clamped, not -1
    expect((await counters(f, f.userB,)).visible,).toBe(0,);
  });

  test("REPLACE drifts +1 and reconcile heals it", async () => {
    const f = await mkChat();
    await insertMsg(f, { createdAt: "2026-01-01T00:00:01Z", },);
    const before = await counters(f, f.userA,);
    const existing = await db.selectFrom("messages",).select(["id", "created_at",],).where("chat_id", "=", f.chatId,)
      .where("visibility", "=", "visible",).limit(1,).executeTakeFirst();

    // SQLite INSERT OR REPLACE: with recursive_triggers OFF the conflict-replace
    // deletion does NOT fire the AFTER DELETE trigger — only the INSERT arm runs.
    // Documented drift (+1 per replaced visible row); the reconcile cron heals it.
    await sql`INSERT OR REPLACE INTO messages (id, chat_id, actor_id, role, content, created_at, visibility)
      VALUES (${existing!.id}, ${f.chatId}, ${f.userA}, 'user', 'replaced', ${existing!.created_at}, 'visible')`
      .execute(db,);

    const after = await counters(f, f.userA,);
    expect(after.visible,).toBe(before.visible + 1,);
    expect(await visibleCount(db, f.chatId,),).toBe(before.visible,);
    const summary = await runUnreadReconcile(db,);
    expect(summary.chats,).toBeGreaterThan(0,);
    expect((await counters(f, f.userA,)).visible,).toBe(before.visible,);
  });

  test("maintained counters match the grouped predicate on the fixture", async () => {
    const f = await mkChat();
    await insertMsg(f, { createdAt: "2026-01-01T00:00:01Z", },);
    await insertMsg(f, { createdAt: "2026-01-01T00:00:02Z", visibility: "hidden_by_user", },);
    await insertMsg(f, { createdAt: "2026-01-01T00:00:03Z", },);
    const readId = await insertMsg(f, { createdAt: "2026-01-01T00:00:04Z", },);
    // Same statement shape the mark-read route issues: watermark on the
    // latest message zeroes the counter consistently with the predicate.
    await db.updateTable("chat_participants",).set({
      last_read_message_id: readId,
      last_read_created_at: "2026-01-01T00:00:04Z",
      unread_count: 0,
    },).where("chat_id", "=", f.chatId,).where("actor_id", "=", f.userA,).execute();

    expect((await counters(f, f.userA,)).visible,).toBe(await visibleCount(db, f.chatId,),);
    expect((await counters(f, f.userA,)).unread,).toBe(await expectedUnread(db, f.chatId, f.userA,),);
    expect((await counters(f, f.userB,)).unread,).toBe(await expectedUnread(db, f.chatId, f.userB,),);
  });

  test("reconcile self-heals drifted rows", async () => {
    const f = await mkChat();
    const t1 = await insertMsg(f, { createdAt: "2026-01-01T00:00:01Z", },);
    await db.updateTable("chat_participants",).set({
      last_read_message_id: t1,
      last_read_created_at: "2026-01-01T00:00:01Z",
    },)
      .where("chat_id", "=", f.chatId,).where("actor_id", "=", f.userA,).execute();

    await db.updateTable("chats",).set({ visible_message_count: 99, },).where("id", "=", f.chatId,).execute();
    await db.updateTable("chat_participants",).set({ unread_count: 7, last_read_created_at: null, },)
      .where("chat_id", "=", f.chatId,).where("actor_id", "=", f.userA,).execute();

    const summary = await runUnreadReconcile(db,);
    expect(summary.chats,).toBeGreaterThan(0,);
    expect(summary.participants,).toBeGreaterThan(0,);
    expect((await counters(f, f.userA,)).visible,).toBe(await visibleCount(db, f.chatId,),);
    expect((await counters(f, f.userA,)).unread,).toBe(await expectedUnread(db, f.chatId, f.userA,),);
    expect((await counters(f, f.userA,)).watermark,).toBe("2026-01-01T00:00:01Z",);
    // Clean pass reports no drift.
    const clean = await runUnreadReconcile(db,);
    expect(clean.chats,).toBe(0,);
    expect(clean.participants,).toBe(0,);
  });
});

describe("mark-read route O(1) reset", () => {
  let db: Kysely<DB>;
  let userId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await db.insertInto("users",).values({
      id: userId,
      username: "u",
      display_name: "u",
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();

    await db.insertInto("actors",).values({
      id: userId,
      actor_type: "user",
      display_name: "u",
      user_id: userId,
      owner_id: userId,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },).execute();

    chatId = uid();
    await db.insertInto("chats",).values({
      id: chatId,
      name: "c",
      type: "direct",
      mode: "direct",
      created_by: userId,
    },).execute();

    await db.insertInto("chat_participants",).values({ chat_id: chatId, actor_id: userId, },).execute();
    await db.insertInto("messages",).values({
      id: uid(),
      chat_id: chatId,
      actor_id: userId,
      role: MessageRole.User,
      content: "m",
      created_at: "2026-01-01T00:00:01Z",
      visibility: "visible",
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("PUT mark-read zeroes unread and sets the watermark", async () => {
    const msg = await db.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst();
    const app = new Elysia({ name: "test-extras", },)
      .derive(() => ({ userId, userRole: "user", }))
      .use(extrasRoutes({ database: db, } as never,),);

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/mark-read`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ messageId: msg!.id, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const p = await db.selectFrom("chat_participants",).select([
      "unread_count",
      "last_read_created_at",
      "last_read_message_id",
    ],)
      .where("chat_id", "=", chatId,).where("actor_id", "=", userId,).executeTakeFirst();

    expect(p?.unread_count,).toBe(0,);
    expect(p?.last_read_created_at,).toBe("2026-01-01T00:00:01Z",);
    expect(p?.last_read_message_id,).toBe(msg!.id,);
  });
});
