/**
 * Unit tests for chat/world-invites.ts — world invite code creation and the
 * join-into-world_members flow for chat-only worlds.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import {
  createWorldInvite,
  listWorldInvites,
  redeemWorldInvite,
  revokeWorldInvite,
} from "./world-invites";

describe("world invites service", () => {
  let db: Kysely<DB>;
  let worldId: string;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, "owner", "Owner", { id: "user-owner", } as never,);
    await insertActors(db, "Owner", { id: "user-owner", user_id: "user-owner", owner_id: "user-owner", } as never,);
    await insertWorlds(db, "user-owner", "Chat World", { id: "world-invite-1", kind: "chat", } as never,);
    worldId = "world-invite-1";
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  describe("createWorldInvite", () => {
    it("creates a world invite with an 8-char code and defaults", async () => {
      const created = await createWorldInvite(db, { worldId, createdBy: "user-owner", },);
      expect(created.ok,).toBe(true,);
      if (!created.ok) { return; }
      const row = created.value;
      expect(row.code,).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/,);
      expect(row.worldId,).toBe(worldId,);
      expect(row.createdBy,).toBe("user-owner",);
      expect(row.expiresAt,).toBeNull();
      expect(row.maxUses,).toBeNull();
      expect(row.uses,).toBe(0,);
      expect(row.revoked,).toBe(false,);
    });

    it("honors expiresAt and maxUses", async () => {
      const future = new Date(Date.now() + 60_000,).toISOString();
      const created = await createWorldInvite(db, {
        worldId,
        createdBy: "user-owner",
        expiresAt: future,
        maxUses: 3,
      },);
      expect(created.ok,).toBe(true,);
      if (!created.ok) { return; }
      expect(created.value.expiresAt,).toBe(future,);
      expect(created.value.maxUses,).toBe(3,);
    });
  });

  describe("listWorldInvites", () => {
    it("returns invites newest first", async () => {
      await createWorldInvite(db, { worldId, createdBy: "user-owner", },);
      await createWorldInvite(db, { worldId, createdBy: "user-owner", },);
      const invites = await listWorldInvites(db, worldId,);
      expect(invites,).toHaveLength(2,);
    });

    it("does not leak invites from other worlds", async () => {
      await createWorldInvite(db, { worldId, createdBy: "user-owner", },);
      const invites = await listWorldInvites(db, "another-world",);
      expect(invites,).toHaveLength(0,);
    });
  });

  describe("revokeWorldInvite", () => {
    it("revokes an invite", async () => {
      const created = await createWorldInvite(db, { worldId, createdBy: "user-owner", },);
      if (!created.ok) { return; }
      const revoked = await revokeWorldInvite(db, worldId, created.value.id,);
      expect(revoked.ok,).toBe(true,);
      if (!revoked.ok) { return; }
      expect(revoked.value.revoked,).toBe(true,);
    });

    it("rejects a missing or foreign invite", async () => {
      const missing = await revokeWorldInvite(db, worldId, "nope",);
      expect(missing.ok,).toBe(false,);
      if (!missing.ok) { expect(missing.error.code,).toBe("not_found",); }
    });
  });

  describe("redeemWorldInvite (join)", () => {
    it("adds the joining actor to world_members", async () => {
      await insertUsers(db, "joiner", "Joiner", { id: "user-joiner", } as never,);
      await insertActors(
        db,
        "Joiner",
        { id: "user-joiner", user_id: "user-joiner", owner_id: "user-joiner", } as never,
      );

      const created = await createWorldInvite(db, { worldId, createdBy: "user-owner", },);
      if (!created.ok) { return; }
      const outcome = await redeemWorldInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.worldId,).toBe(worldId,);
      expect(outcome.alreadyMember,).toBe(false,);

      const member = await db
        .selectFrom("world_members",)
        .selectAll()
        .where("world_id", "=", worldId,)
        .where("actor_id", "=", "user-joiner",)
        .executeTakeFirst();
      expect(member,).toBeTruthy();
    });

    it("increments the usage counter", async () => {
      await insertUsers(db, "joiner", "Joiner", { id: "user-joiner", } as never,);
      await insertActors(
        db,
        "Joiner",
        { id: "user-joiner", user_id: "user-joiner", owner_id: "user-joiner", } as never,
      );
      const created = await createWorldInvite(db, { worldId, createdBy: "user-owner", },);
      if (!created.ok) { return; }
      await redeemWorldInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      const invites = await listWorldInvites(db, worldId,);
      expect(invites[0]!.uses,).toBe(1,);
    });

    it("is idempotent for an existing member (no double count)", async () => {
      await insertUsers(db, "joiner", "Joiner", { id: "user-joiner", } as never,);
      await insertActors(
        db,
        "Joiner",
        { id: "user-joiner", user_id: "user-joiner", owner_id: "user-joiner", } as never,
      );
      const created = await createWorldInvite(db, { worldId, createdBy: "user-owner", maxUses: 1, },);
      if (!created.ok) { return; }
      await redeemWorldInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      const second = await redeemWorldInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      expect(second.ok,).toBe(true,);
      if (!second.ok) { return; }
      expect(second.alreadyMember,).toBe(true,);
      const invites = await listWorldInvites(db, worldId,);
      expect(invites[0]!.uses,).toBe(1,);
    });

    it("rejects an unknown code", async () => {
      await insertUsers(db, "joiner", "Joiner", { id: "user-joiner", } as never,);
      const outcome = await redeemWorldInvite(db, { code: "NOPE1234", actorId: "user-joiner", },);
      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) { expect(outcome.error.code,).toBe("not_found",); }
    });

    it("rejects a revoked invite", async () => {
      const created = await createWorldInvite(db, { worldId, createdBy: "user-owner", },);
      if (!created.ok) { return; }
      await revokeWorldInvite(db, worldId, created.value.id,);
      const outcome = await redeemWorldInvite(db, { code: created.value.code, actorId: "user-owner", },);
      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) { expect(outcome.error.code,).toBe("revoked",); }
    });

    it("rejects an expired invite", async () => {
      const created = await createWorldInvite(db, {
        worldId,
        createdBy: "user-owner",
        expiresAt: new Date(Date.now() - 1000,).toISOString(),
      },);
      if (!created.ok) { return; }
      const outcome = await redeemWorldInvite(db, { code: created.value.code, actorId: "user-owner", },);
      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) { expect(outcome.error.code,).toBe("expired",); }
    });

    it("rejects an invite that reached its usage limit", async () => {
      await insertUsers(db, "joiner", "Joiner", { id: "user-joiner", } as never,);
      await insertActors(
        db,
        "Joiner",
        { id: "user-joiner", user_id: "user-joiner", owner_id: "user-joiner", } as never,
      );
      const created = await createWorldInvite(db, { worldId, createdBy: "user-owner", maxUses: 1, },);
      if (!created.ok) { return; }
      await redeemWorldInvite(db, { code: created.value.code, actorId: "user-joiner", },);
      await insertUsers(db, "joiner2", "Joiner2", { id: "user-joiner2", } as never,);
      await insertActors(
        db,
        "Joiner2",
        { id: "user-joiner2", user_id: "user-joiner2", owner_id: "user-joiner2", } as never,
      );
      const outcome = await redeemWorldInvite(db, { code: created.value.code, actorId: "user-joiner2", },);
      expect(outcome.ok,).toBe(false,);
      if (!outcome.ok) { expect(outcome.error.code,).toBe("used_up",); }
    });
  });
});
