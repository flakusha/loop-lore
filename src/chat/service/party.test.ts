/**
 * Tests for party join/leave (C7 — group-chat VN party migration).
 *
 * Covers join/leave happy paths, idempotent rejoin, guest role,
 * group-chat VN narration (on/off), and error cases (missing chat,
 * leaving a chat you are not in).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";
import { randomUUID, } from "node:crypto";
import { initSmk, } from "../../crypto/smk";
import {
  ChatParticipantRole,
  MessageContentType,
  MessageRole,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { joinParty, leaveParty, } from "./party";
import { injectPartyNarration, } from "./party-narration";

describe("party join/leave (C7)", () => {
  let db: Kysely<DB>;
  const userA = crypto.randomUUID();
  const heroActorId = crypto.randomUUID();
  const companionActorId = crypto.randomUUID();
  const narratorId = crypto.randomUUID();
  const vnChatId = crypto.randomUUID();
  const plainChatId = crypto.randomUUID();
  const missingChatId = "missing-chat";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-a-${userA}`, "User A", { id: userA, } as never,);
    await insertActors(db, "Player A", { id: userA, user_id: userA, owner_id: userA, } as never,);
    await insertActors(db, "Hero", { id: heroActorId, user_id: userA, owner_id: userA, } as never,);
    await insertActors(db, "Companion", {
      id: companionActorId,
      user_id: userA,
      owner_id: userA,
      actor_type: "character",
      agent_type: "ai",
    } as never,);

    // A narrator actor so VN narration can be emitted.
    await insertActors(db, "Narrator", {
      id: narratorId,
      actor_type: "narrator",
      agent_type: "narrator",
    } as never,);

    await insertChats(
      db,
      "VN Group",
      userA,
      {
        id: vnChatId,
        type: "group",
        mode: "group",
        gm_config: JSON.stringify({ renderingOverride: "visual_novel", },),
      } as never,
    );

    await insertChats(
      db,
      "Plain Group",
      userA,
      {
        id: plainChatId,
        type: "group",
        mode: "group",
        gm_config: JSON.stringify({ renderingOverride: null, },),
      } as never,
    );

    // Owner is always a participant of the group.
    await insertChatParticipants(db, vnChatId, userA, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    await insertChatParticipants(db, plainChatId, userA, { role_in_chat: ChatParticipantRole.Owner, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  describe("joinParty", () => {
    test("joins a new member with role + default talkativity on a plain chat", async () => {
      const result = await joinParty(db, { chatId: plainChatId, actorId: heroActorId, },);
      expect(result,).toEqual({
        ok: true,
        participant: { actorId: heroActorId, role: "member", talkativity: 5, },
      },);

      const row = await db
        .selectFrom("chat_participants",)
        .select(["actor_id", "role_in_chat", "talkativity",],)
        .where("chat_id", "=", plainChatId,)
        .where("actor_id", "=", heroActorId,)
        .executeTakeFirst();

      expect(row?.role_in_chat,).toBe("member",);
      expect(row?.talkativity,).toBe(5,);
    });

    test("joins with an explicit guest role", async () => {
      const result = await joinParty(db, {
        chatId: plainChatId,
        actorId: companionActorId,
        role: ChatParticipantRole.Guest,
      },);

      expect(result,).toEqual({
        ok: true,
        participant: { actorId: companionActorId, role: "guest", talkativity: 5, },
      },);

      const row = await db
        .selectFrom("chat_participants",)
        .select("role_in_chat",)
        .where("chat_id", "=", plainChatId,)
        .where("actor_id", "=", companionActorId,)
        .executeTakeFirst();

      expect(row?.role_in_chat,).toBe("guest",);
    });

    test("re-joining an existing member is an idempotent no-op success", async () => {
      const first = await joinParty(db, { chatId: plainChatId, actorId: heroActorId, },);
      const second = await joinParty(db, { chatId: plainChatId, actorId: heroActorId, },);
      expect(first,).toEqual(second,);

      const rows = await db
        .selectFrom("chat_participants",)
        .selectAll()
        .where("chat_id", "=", plainChatId,)
        .where("actor_id", "=", heroActorId,)
        .execute();

      expect(rows,).toHaveLength(1,);
    });

    test("emits a VN narration message on join when the chat is in VN mode", async () => {
      // heroActorId has not joined vnChatId yet — ensure clean.
      await db.deleteFrom("chat_participants",).where("chat_id", "=", vnChatId,).where("actor_id", "=", heroActorId,)
        .execute();

      const result = await joinParty(db, { chatId: vnChatId, actorId: heroActorId, },);
      expect("ok" in result ? result.ok : false,).toBe(true,);

      const narration = await db
        .selectFrom("messages",)
        .selectAll()
        .where("chat_id", "=", vnChatId,)
        .where("content_type", "=", MessageContentType.Narration,)
        .execute();

      expect(narration,).toHaveLength(1,);
      expect(narration[0]?.role,).toBe(MessageRole.System,);
      expect(narration[0]?.actor_id,).toBe(narratorId,);
      expect(narration[0]?.content,).toContain("joined",);
    });

    test("returns not_found for a missing chat", async () => {
      const result = await joinParty(db, { chatId: missingChatId, actorId: heroActorId, },);
      expect(result,).toEqual({ code: "not_found", message: "Chat not found", },);
    });
  });

  describe("leaveParty", () => {
    test("removes a member from a plain chat", async () => {
      await joinParty(db, { chatId: plainChatId, actorId: companionActorId, },);
      const result = await leaveParty(db, { chatId: plainChatId, actorId: companionActorId, },);
      expect(result,).toEqual({ ok: true, },);

      const row = await db
        .selectFrom("chat_participants",)
        .select("actor_id",)
        .where("chat_id", "=", plainChatId,)
        .where("actor_id", "=", companionActorId,)
        .executeTakeFirst();

      expect(row,).toBeUndefined();
    });

    test("emits a VN narration message on leave when the chat is in VN mode", async () => {
      await joinParty(db, { chatId: vnChatId, actorId: companionActorId, },);
      const result = await leaveParty(db, { chatId: vnChatId, actorId: companionActorId, },);
      expect(result,).toEqual({ ok: true, },);

      const narrations = await db
        .selectFrom("messages",)
        .select("content",)
        .where("chat_id", "=", vnChatId,)
        .where("content_type", "=", MessageContentType.Narration,)
        .orderBy("created_at", "asc",)
        .execute();

      const join = narrations.find((n,) => n.content?.includes("joined",));
      const leave = narrations.find((n,) => n.content?.includes("left",));
      expect(join,).toBeDefined();
      expect(leave,).toBeDefined();
    });

    test("returns not_found when the member is not in the chat", async () => {
      // Use an actor id that has never joined.
      const missingMember = "never-joined-actor";
      const result = await leaveParty(db, { chatId: plainChatId, actorId: missingMember, },);
      expect(result,).toEqual({ code: "not_found", message: "Participant not in chat", },);
    });

    test("returns not_found for a missing chat", async () => {
      const result = await leaveParty(db, { chatId: missingChatId, actorId: heroActorId, },);
      expect(result,).toEqual({ code: "not_found", message: "Chat not found", },);
    });
  });
});

describe("CG-18 residual — injected narration is FTS-searchable", () => {
  let db: Kysely<DB>;
  let suffix: string;
  let ownerId: string;
  let narratorId: string;
  let chatId: string;

  beforeEach(async () => {
    suffix = randomUUID().replaceAll("-", "",);
    ownerId = `u-${suffix}`;
    narratorId = `n-${suffix}`;
    chatId = `c-${suffix}`;
    ({ db, } = await createTestDb());

    await insertUsers(db, `narration-${suffix}`, "Narration User", {
      id: ownerId,
      encryption_secret: "9".repeat(64,),
    } as never,);

    await insertActors(db, "Narrator", {
      id: narratorId,
      actor_type: "narrator",
      agent_type: "narrator",
    } as never,);

    await insertChats(db, "Narration Chat", ownerId, {
      id: chatId,
      type: "group",
      mode: "group",
      encryption_level: "standard",
    } as never,);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("encryption off: narration row carries content_plaintext and FTS MATCH finds it", async () => {
    const token = `cg18narr${suffix}`;
    const text = `watchword ${token} end`;
    await injectPartyNarration(db, chatId, text,);

    const row = await db
      .selectFrom("messages",)
      .select(["id", "content_plaintext",],)
      .where("chat_id", "=", chatId,)
      .where("content_type", "=", "narration",)
      .executeTakeFirstOrThrow();

    expect(row.content_plaintext,).toBe(text,);

    const match = await sql<
      { message_id: string }
    >`SELECT message_id FROM messages_fts WHERE messages_fts MATCH ${token}`.execute(db,);

    expect(match.rows.map((r,) => r.message_id),).toContain(row.id,);
  });

  test("encryption on: encrypted narration stays FTS-searchable without blind tokens", async () => {
    const token = `cg18narrenc${suffix}`;
    const text = `watchword ${token} end`;
    await initSmk({
      serverEncryptionKey: "b".repeat(64,),
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);

    process.env.ENABLE_TOKEN_INDEXING = "1";
    try {
      await injectPartyNarration(db, chatId, text,);

      const row = await db
        .selectFrom("messages",)
        .select(["id", "content", "content_plaintext",],)
        .where("chat_id", "=", chatId,)
        .where("content_type", "=", "narration",)
        .executeTakeFirstOrThrow();

      expect(row.content,).not.toBe(text,);
      expect(row.content_plaintext,).toBe(text,);

      const match = await sql<
        { message_id: string }
      >`SELECT message_id FROM messages_fts WHERE messages_fts MATCH ${token}`.execute(db,);

      expect(match.rows.map((r,) => r.message_id),).toContain(row.id,);

      const blind = await db
        .selectFrom("message_search_tokens",)
        .select("term",)
        .where("message_id", "=", row.id,)
        .execute();

      expect(blind,).toHaveLength(0,);
    } finally {
      delete process.env.ENABLE_TOKEN_INDEXING;
      await initSmk({
        required: false,
        compressThreshold: 1024,
        compressAlgorithm: "gzip",
      },);
    }
  });
});
