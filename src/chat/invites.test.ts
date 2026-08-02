/**
 * Unit tests for chat/invites.ts — invite code generation and join mechanics.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import {
  createInvite,
  generateInviteCode,
  listInvites,
  redeemInvite,
  revokeInvite,
} from "./invites";

describe("chat invites service", () => {
  let db: Kysely<DB>;
  let chatId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "owner", "Owner", { id: "user-owner", } as never,);
    await insertActors(db, "Owner", { id: "user-owner", user_id: "user-owner", owner_id: "user-owner", } as never,);
    await insertUsers(db, "joiner", "Joiner", { id: "user-joiner", } as never,);
    await insertActors(db, "Joiner", { id: "user-joiner", user_id: "user-joiner", owner_id: "user-joiner", } as never,);

    await db
      .insertInto("chats",)
      .values({
        id: "chat-invite-1",
        name: "Invite Chat",
        created_by: "user-owner",
        type: "group",
        mode: "group",
      },)
      .execute();
    chatId = "chat-invite-1";
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  describe("generateInviteCode", () => {
    it("produces an 8-char code from the unambiguous alphabet", () => {
      const code = generateInviteCode();
      expect(code,).toHaveLength(8,);
      expect(code,).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/,);
    });

    it("produces distinct codes", () => {
      const codes = new Set(Array.from({ length: 100, }, () => generateInviteCode(),),);
      expect(codes.size,).toBe(100,);
    });
  });

  describe("createInvite", () => {
    it("creates an invite with a code and defaults", async () => {
      const res = await createInvite(db, { chatId, createdBy: "user-owner", },);
      expect(res.ok,).toBe(true,);
      if (!res.ok) return;
      expect(res.value.code,).toHaveLength(8,);
      expect(res.value.chatId,).toBe(chatId,);
      expect(res.value.revoked,).toBe(false,);
      expect(res.value.uses,).toBe(0,);
      expect(res.value.expiresAt,).toBeNull();
      expect(res.value.maxUses,).toBeNull();
    });

    it("persists expiresAt and maxUses", async () => {
      const future = new Date(Date.now() + 86_400_000,).toISOString();
      const res = await createInvite(db, {
        chatId,
        createdBy: "user-owner",
        expiresAt: future,
        maxUses: 5,
      },);
      expect(res.ok,).toBe(true,);
      if (!res.ok) return;
      expect(res.value.expiresAt,).toBe(future,);
      expect(res.value.maxUses,).toBe(5,);
    });

    it("rejects maxUses < 1", async () => {
      const res = await createInvite(db, { chatId, createdBy: "user-owner", maxUses: 0, },);
      expect(res.ok,).toBe(false,);
      if (!res.ok) expect(res.error.code,).toBe("bad_request",);
    });

    it("rejects invalid expiresAt", async () => {
      const res = await createInvite(db, { chatId, createdBy: "user-owner", expiresAt: "not-a-date", },);
      expect(res.ok,).toBe(false,);
      if (!res.ok) expect(res.error.code,).toBe("bad_request",);
    });
  });

  describe("listInvites", () => {
    it("returns invites for a chat", async () => {
      await createInvite(db, { chatId, createdBy: "user-owner", },);
      await createInvite(db, { chatId, createdBy: "user-owner", },);
      const invites = await listInvites(db, chatId,);
      expect(invites,).toHaveLength(2,);
    });

    it("returns empty for a chat with no invites", async () => {
      expect(await listInvites(db, chatId,),).toEqual([],);
    });
  });

  describe("revokeInvite", () => {
    it("revokes an invite", async () => {
      const created = await createInvite(db, { chatId, createdBy: "user-owner", },);
      if (!created.ok) return;
      const res = await revokeInvite(db, chatId, created.value.id,);
      expect(res.ok,).toBe(true,);
      const invites = await listInvites(db, chatId,);
      expect(invites[0]!.revoked,).toBe(true,);
    });

    it("returns not_found for an invite from another chat", async () => {
      const created = await createInvite(db, { chatId, createdBy: "user-owner", },);
      if (!created.ok) return;
      const res = await revokeInvite(db, "other-chat", created.value.id,);
      expect(res.ok,).toBe(false,);
      if (!res.ok) expect(res.error.code,).toBe("not_found",);
    });
  });

  describe("redeemInvite (join)", () => {
    it("adds the joining actor as a participant", async () => {
      const created = await createInvite(db, { chatId, createdBy: "user-owner", },);
      if (!created.ok) return;
      const outcome = await redeemInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) return;
      expect(outcome.chatId,).toBe(chatId,);
      expect(outcome.alreadyMember,).toBe(false,);

      const participant = await db
        .selectFrom("chat_participants",)
        .select(["actor_id", "role_in_chat",],)
        .where("chat_id", "=", chatId,)
        .where("actor_id", "=", "user-joiner",)
        .executeTakeFirst();
      expect(participant,).toBeTruthy();
      expect(participant!.role_in_chat,).toBe("member",);
    });

    it("increments the usage counter", async () => {
      const created = await createInvite(db, { chatId, createdBy: "user-owner", },);
      if (!created.ok) return;
      await redeemInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      const invites = await listInvites(db, chatId,);
      expect(invites[0]!.uses,).toBe(1,);
    });

    it("is idempotent for an existing participant (no double count)", async () => {
      const created = await createInvite(db, { chatId, createdBy: "user-owner", maxUses: 1, },);
      if (!created.ok) return;
      await redeemInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      const second = await redeemInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      expect(second.ok,).toBe(true,);
      if (!second.ok) return;
      expect(second.alreadyMember,).toBe(true,);
      // Re-joining as an existing member must not consume another use.
      const invites = await listInvites(db, chatId,);
      expect(invites[0]!.uses,).toBe(1,);
    });

    it("rejects an unknown code", async () => {
      const outcome = await redeemInvite(db, { code: "NOPE1234", actorId: "user-joiner", },);
      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) expect(outcome.error.code,).toBe("not_found",);
    });

    it("rejects a revoked invite", async () => {
      const created = await createInvite(db, { chatId, createdBy: "user-owner", },);
      if (!created.ok) return;
      await revokeInvite(db, chatId, created.value.id,);
      const outcome = await redeemInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) expect(outcome.error.code,).toBe("revoked",);
    });

    it("rejects an expired invite", async () => {
      const created = await createInvite(db, {
        chatId,
        createdBy: "user-owner",
        expiresAt: new Date(Date.now() - 1000,).toISOString(),
      },);
      if (!created.ok) return;
      const outcome = await redeemInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) expect(outcome.error.code,).toBe("expired",);
    });

    it("rejects an invite that reached its usage limit", async () => {
      const created = await createInvite(db, { chatId, createdBy: "user-owner", maxUses: 1, },);
      if (!created.ok) return;
      await redeemInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      // Second distinct actor tries to use the capped invite.
      await insertUsers(db, "joiner2", "Joiner2", { id: "user-joiner2", } as never,);
      await insertActors(db, "Joiner2", { id: "user-joiner2", user_id: "user-joiner2", owner_id: "user-joiner2", } as never,);
      const outcome = await redeemInvite(db, { code: created.value.code, actorId: "user-joiner2", },);
      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) expect(outcome.error.code,).toBe("used_up",);
    });
  });
});
