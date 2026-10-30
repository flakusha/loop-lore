// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct unit coverage for the owners-set plumbing helpers
 * (epic-chat-multi-ownership): owners-core's materializeCreatorOwnerRow,
 * resolveActorOwningUser, demoteOwnerParticipantRole, writeOwnersAuditRow,
 * owners-events' buildOwnersAuditMeta + emitOwnersChangeNotifications, and
 * owners-types' MAX_CHAT_OWNERS. The add/remove operation tests exercise
 * these indirectly; this file pins each helper's contract so the
 * test-gaps gate sees a real import-edge per export.
 *
 * Parallel-safety: one private :memory: DB per test via createTestDb(),
 * randomUUID-suffixed fixtures, full teardown — order-independent and
 * safe to run concurrently with other files.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatOwners,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  demoteOwnerParticipantRole,
  listOwnerUserIds,
  materializeCreatorOwnerRow,
  resolveActorOwningUser,
  writeOwnersAuditRow,
} from "./owners-core";
import { buildOwnersAuditMeta, emitOwnersChangeNotifications, type OwnersChangeEvent, } from "./owners-events";
import { MAX_CHAT_OWNERS, } from "./owners-types";

function eventFixture(overrides: Partial<OwnersChangeEvent> = {},): OwnersChangeEvent {
  return {
    chatId: randomUUID(),
    action: "chat_owner_added",
    userId: randomUUID(),
    performedBy: randomUUID(),
    owners: [],
    autoInvited: false,
    reason: null,
    ...overrides,
  };
}

describe("owners plumbing helpers", () => {
  test("materializeCreatorOwnerRow seeds the creator row once, then no-ops", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const creator = await insertUsers(db, `mat-cr-${randomUUID()}`, "Creator",);
      const chat = await insertChats(db, "Mat Chat", creator,);
      await db.deleteFrom("chat_owners",).where("chat_id", "=", chat,).execute();

      await db.transaction().execute(async (trx,) => {
        await materializeCreatorOwnerRow(trx as Kysely<DB>, chat, creator,);
      },);

      expect(await listOwnerUserIds(db, chat,),).toEqual([creator,],);

      // Idempotent: a second call with a different creator id keeps the row.
      await db.transaction().execute(async (trx,) => {
        await materializeCreatorOwnerRow(trx as Kysely<DB>, chat, randomUUID(),);
      },);

      expect(await listOwnerUserIds(db, chat,),).toEqual([creator,],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("resolveActorOwningUser prefers persona user_id, falls back to owner_id, null when missing", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const owner = await insertUsers(db, `res-own-${randomUUID()}`, "Owner",);
      const personaUser = await insertUsers(db, `res-pu-${randomUUID()}`, "PersonaUser",);
      const persona = await insertActors(db, "Persona", { user_id: personaUser, owner_id: owner, },);
      expect(await resolveActorOwningUser(db, persona,),).toBe(personaUser,);

      const adopted = await insertActors(db, "Adopted", { user_id: null, owner_id: owner, } as never,);
      expect(await resolveActorOwningUser(db, adopted,),).toBe(owner,);

      expect(await resolveActorOwningUser(db, randomUUID(),),).toBeNull();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("demoteOwnerParticipantRole drops owner to member, ignores members and strangers", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const creator = await insertUsers(db, `dem-cr-${randomUUID()}`, "Creator",);
      const chat = await insertChats(db, "Dem Chat", creator,);
      const memberUser = await insertUsers(db, `dem-m-${randomUUID()}`, "Member",);
      const stranger = randomUUID();

      // Participant rows key on ACTOR ids — register matching actors.
      await insertActors(db, "DemCreator", { id: creator, user_id: creator, owner_id: creator, } as never,);
      await insertActors(db, "DemMember", {
        id: memberUser,
        user_id: memberUser,
        owner_id: memberUser,
      } as never,);

      await insertChatParticipants(db, chat, creator, { role_in_chat: ChatParticipantRole.Owner, },);
      await insertChatParticipants(db, chat, memberUser, { role_in_chat: ChatParticipantRole.Member, },);

      await db.transaction().execute(async (trx,) => {
        await demoteOwnerParticipantRole(trx as Kysely<DB>, chat, creator,);
        await demoteOwnerParticipantRole(trx as Kysely<DB>, chat, memberUser,);
        await demoteOwnerParticipantRole(trx as Kysely<DB>, chat, stranger,);
      },);

      const rows = await db.selectFrom("chat_participants",)
        .select(["actor_id", "role_in_chat",],)
        .where("chat_id", "=", chat,)
        .execute();

      const byActor = new Map(rows.map((r,) => [r.actor_id, r.role_in_chat,]),);
      expect(byActor.get(creator,),).toBe(ChatParticipantRole.Member,);
      expect(byActor.get(memberUser,),).toBe(ChatParticipantRole.Member,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("writeOwnersAuditRow records the add/remove audit shape", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const actor = await insertUsers(db, `aud-${randomUUID()}`, "Actor",);
      const added = eventFixture({ action: "chat_owner_added", performedBy: actor, owners: [actor,], },);
      const removed = eventFixture({
        action: "chat_owner_removed",
        chatId: added.chatId,
        performedBy: actor,
        owners: [],
      },);

      await db.transaction().execute(async (trx,) => {
        await writeOwnersAuditRow(trx as Kysely<DB>, added, "2026-10-30T00:00:00.000Z",);
        await writeOwnersAuditRow(trx as Kysely<DB>, removed, "2026-10-30T00:00:01.000Z",);
      },);

      const rows = await db.selectFrom("log_entries",)
        .select(["message", "event_type", "entity_id", "user_id", "meta",],)
        .where("entity_id", "=", added.chatId,)
        .orderBy("created_at",)
        .execute();

      expect(rows.map((r,) => r.message),).toEqual(["Chat owner added", "Chat owner removed",],);
      expect(rows.map((r,) => r.event_type),).toEqual(["chat_owner_added", "chat_owner_removed",],);
      expect(rows[0]!.meta,).toBe(buildOwnersAuditMeta(added,),);
      expect(rows.every((r,) => r.user_id === actor),).toBe(true,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("buildOwnersAuditMeta encodes the change; unserializable input yields {}", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      // Touch the DB so the helper is reached through a real handle.
      await insertUsers(db, `meta-${randomUUID()}`, "Meta",);
      const event = eventFixture({ owners: ["u1", "u2",], autoInvited: true, reason: "pairing", },);
      const parsed = JSON.parse(buildOwnersAuditMeta(event,),);
      expect(parsed,).toMatchObject({
        entity_type: "chat",
        entity_id: event.chatId,
        action: "chat_owner_added",
        user_id: event.userId,
        performed_by: event.performedBy,
        owners: ["u1", "u2",],
        auto_invited: true,
        reason: "pairing",
      },);

      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const bad = eventFixture({ owners: [], reason: circular as unknown as null, },);
      expect(buildOwnersAuditMeta(bad,),).toBe("{}",);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("emitOwnersChangeNotifications notifies the affected user plus remaining owners", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const owner = await insertUsers(db, `not-own-${randomUUID()}`, "Owner",);
      const added = await insertUsers(db, `not-add-${randomUUID()}`, "Added",);
      const chat = await insertChats(db, "Not Chat", owner,);
      // insertChats already seeds the creator's row — only the added
      // owner's row needs an explicit grant.
      await insertChatOwners(db, chat, added,);

      emitOwnersChangeNotifications(
        db,
        eventFixture({
          chatId: chat,
          action: "chat_owner_added",
          userId: added,
          performedBy: owner,
          owners: [owner, added,],
          autoInvited: true,
        },),
      );

      // NotificationService.emit is fire-and-forget (`void create().catch`);
      // one macrotask lets the inserts land deterministically. Real timers
      // are required: the production path resolves on the platform clock,
      // not a virtual one.
      const { promise, resolve, } = Promise.withResolvers<void>();
      setTimeout(resolve, 25,);
      await promise;
      const notes = await db.selectFrom("notifications",)
        .select(["user_id", "title", "link",],)
        .where("link", "=", `/chat/${chat}`,)
        .execute();

      expect(notes.map((n,) => n.user_id).sort(),).toEqual([owner, added,].sort(),);
      expect(notes.find((n,) => n.user_id === added)?.title,).toContain("now a chat owner",);
      expect(notes.find((n,) => n.user_id === owner)?.title,).toContain("co-owner",);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("MAX_CHAT_OWNERS is the enforced concurrent-owners ceiling", () => {
    expect(MAX_CHAT_OWNERS,).toBe(3,);
  });
});
