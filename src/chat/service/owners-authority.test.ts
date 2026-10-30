// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Co-owner authority behavior tests (epic-chat-multi-ownership cutover,
 * TASK-chat-owners-check-sweep-across-single-owner-call-sites).
 *
 * Contract: after the created_by cutover, every former single-owner gate
 * keys on the chat_owners set. A co-owner (NOT the creator) may do what only
 * the creator could (settings access, batch archive, poll close, hidden
 * message read, party split); a creator who resigned (removed from the set)
 * loses that authority even though chats.created_by still names them.
 *
 * Parallel-safety: one private :memory: DB per test via createTestDb(),
 * file-scoped random UUIDs, full teardown — order-independent, safe to run
 * concurrently with other files.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { ChatVisibility, MessageRole, MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatOwners,
  insertChatParticipants,
  insertChats,
  insertMessagePolls,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  batchArchiveChats,
  checkChatSettingsAccess,
  getMessageWithAccess,
  splitParty,
} from "./index";
import { closePoll, } from "./polls";
import type { SplitBranch, SplitPartyResult, } from "./split";

const CREATOR_ID = randomUUID();
const CO_OWNER_ID = randomUUID();
const CHAT_ID = randomUUID();
const MESSAGE_ID = randomUUID();
const POLL_ID = randomUUID();

/**
 * Seed creator + co-owner (users/actors), a private creator chat with both
 * as participants, a hidden message, a poll, and the owners set holding BOTH.
 * @param db
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  for (const [id, name,] of [[CREATOR_ID, "Creator",], [CO_OWNER_ID, "CoOwner",],] as const) {
    await insertUsers(db, `${name.toLowerCase()}-${id}`, name, { id, } as never,);
    await insertActors(db, name, { id, user_id: id, owner_id: id, } as never,);
  }

  await insertActors(db, "Narrator", {
    id: `narrator-${CHAT_ID}`,
    actor_type: "narrator",
    agent_type: "narrator",
  } as never,);

  // insertChats seeds the creator's baseline owners row.
  await insertChats(db, "Sweep Chat", CREATOR_ID, { id: CHAT_ID, visibility: ChatVisibility.Private, } as never,);
  await insertChatParticipants(db, CHAT_ID, CREATOR_ID, { role_in_chat: "owner", },);
  await insertChatParticipants(db, CHAT_ID, CO_OWNER_ID, { role_in_chat: "owner", },);
  await insertChatOwners(db, CHAT_ID, CO_OWNER_ID,);

  await insertMessages(db, CHAT_ID, CREATOR_ID, MessageRole.User, "hidden", {
    id: MESSAGE_ID,
    visibility: MessageVisibility.HiddenByUser,
  },);

  await insertMessagePolls(db, MESSAGE_ID, "Close me?", JSON.stringify(["a", "b",],), CREATOR_ID, { id: POLL_ID, },);
}

/**
 * Remove `userId` from the chat's owners set and demote their participant
 * role — mirrors removeChatOwner's post-state (simulates resign/removal).
 * @param db
 * @param chatId
 * @param userId
 */
async function resign(db: Kysely<DB>, chatId: string, userId: string,): Promise<void> {
  await db.deleteFrom("chat_owners",).where("chat_id", "=", chatId,).where("user_id", "=", userId,).execute();
  await db
    .updateTable("chat_participants",)
    .set({ role_in_chat: "member", },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .execute();
}

describe("co-owner authority after the created_by cutover", () => {
  test("co-owner (not creator) passes checkChatSettingsAccess; resigned creator is denied", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    expect((await checkChatSettingsAccess(db, CHAT_ID, CO_OWNER_ID, "user",)).ok,).toBe(true,);

    await resign(db, CHAT_ID, CREATOR_ID,);
    // created_by still names the creator, but the set is authority now.
    expect((await checkChatSettingsAccess(db, CHAT_ID, CREATOR_ID, "user",)).ok,).toBe(false,);
    expect((await checkChatSettingsAccess(db, CHAT_ID, CO_OWNER_ID, "user",)).ok,).toBe(true,);

    await db.destroy();
  });

  test("co-owner can batch archive; resigned creator cannot", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    expect(await batchArchiveChats(db, [CHAT_ID,], CO_OWNER_ID,),).toEqual([CHAT_ID,],);

    // Fresh chat owned only by the creator, who then loses the seat: batch
    // ops must skip it even though created_by still names them.
    const otherChat = await insertChats(db, "Other", CREATOR_ID, {} as never,);
    await insertChatParticipants(db, otherChat, CREATOR_ID, { role_in_chat: "owner", },);
    await resign(db, otherChat, CREATOR_ID,);
    expect(await batchArchiveChats(db, [otherChat,], CREATOR_ID,),).toEqual([],);

    await db.destroy();
  });

  test("co-owner can read a hidden message via getMessageWithAccess", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const result = await getMessageWithAccess(db, MESSAGE_ID, CO_OWNER_ID, "user",);
    expect((result as { id?: string }).id,).toBe(MESSAGE_ID,);

    await db.destroy();
  });

  test("co-owner can close the creator's poll", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const result = await closePoll({
      database: db,
      messageId: MESSAGE_ID,
      userId: CO_OWNER_ID,
      userRole: "user",
    },);

    expect(result.ok,).toBe(true,);

    await db.destroy();
  });

  test("party split is owners-set gated: co-owner passes, resigned creator and stranger denied", async () => {
    const fixture = await createTestDb();
    const db = fixture.db;
    await seed(db,);
    const { insertUsers, insertActors, } = await import("../../test-utils/insert-helpers");
    const { listOwnerUserIds, isChatOwner, } = await import("./owners-core");
    const { destroyTestDb, } = await import("../../test-utils/create-test-db");
    const thirdId = randomUUID();
    await insertUsers(db, `third-${thirdId}`, "Third", { id: thirdId, } as never,);
    await insertActors(db, "Third", { id: thirdId, user_id: thirdId, owner_id: thirdId, } as never,);
    const branches: SplitBranch[] = [
      { name: "A", actorIds: [CO_OWNER_ID,], locationId: "", },
      { name: "B", actorIds: [CO_OWNER_ID,], locationId: "", },
    ];

    const ownerRows = await db.selectFrom("chat_owners",).select(["chat_id", "user_id",],).execute();

    expect(ownerRows.filter((r,) => r.chat_id === CHAT_ID).map((r,) => r.user_id).sort(),).toEqual(
      [CREATOR_ID, CO_OWNER_ID,].sort(),
    );

    expect(await isChatOwner(db, CHAT_ID, CO_OWNER_ID,),).toBe(true,);
    expect(await isChatOwner(db, CHAT_ID, CREATOR_ID,),).toBe(true,);
    expect(await isChatOwner(db, CHAT_ID, thirdId,),).toBe(false,);

    // Co-owner passes the owners-set guard (positive); the rest of this
    // test pins the negative side: resigned creator + stranger denied.
    const coOwnerSplit: SplitPartyResult = await splitParty(db, { chatId: CHAT_ID, actorId: CO_OWNER_ID, branches, },);
    if ("code" in coOwnerSplit) {
      const ownersNow = await db.selectFrom("chat_owners",).select(["chat_id", "user_id",],).execute();
      throw new Error(
        `Unexpected split error: ${coOwnerSplit.code} ${coOwnerSplit.message} owners=${JSON.stringify(ownersNow,)}`,
      );
    }

    expect(coOwnerSplit.ok,).toBe(true,);

    // Precondition for the real assertion: even the CREATOR (former
    // single-owner authority) must be denied once resigned from the set.
    // created_by still names the creator — the set is authority now.
    await resign(db, CHAT_ID, CREATOR_ID,);
    expect(await listOwnerUserIds(db, CHAT_ID,),).toEqual([CO_OWNER_ID,],);
    const resignedSplit: SplitPartyResult = await splitParty(db, {
      chatId: CHAT_ID,
      actorId: CREATOR_ID,
      branches: [
        { name: "C", actorIds: [CREATOR_ID,], locationId: "", },
        { name: "C2", actorIds: [CREATOR_ID,], locationId: "", },
      ],
    },);

    expect(resignedSplit,).toEqual(
      expect.objectContaining({ code: "forbidden", },),
    );

    // Stranger with no owners row is denied too.
    const strangerSplit: SplitPartyResult = await splitParty(db, {
      chatId: CHAT_ID,
      actorId: thirdId,
      branches: [
        { name: "S", actorIds: [thirdId,], locationId: "", },
        { name: "S2", actorIds: [thirdId,], locationId: "", },
      ],
    },);

    expect(strangerSplit,).toEqual(
      expect.objectContaining({ code: "forbidden", },),
    );

    await destroyTestDb(fixture,);
  });

  test("migrate carries the source owners set; migrating caller alone never demotes co-owners", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    const { insertChatSetupTemplates, } = await import("../../test-utils/insert-helpers");
    const templateId = await insertChatSetupTemplates(
      db,
      "tpl-migrate",
      "Migrate Template",
      { mode: "direct", } as never,
    );

    const { migrateChat, } = await import("./transitions");
    const result = await migrateChat(db, CHAT_ID, {
      templateId,
      createdBy: CO_OWNER_ID,
      name: "Migrated",
      carry: {},
    },);

    expect("ok" in result && result.ok,).toBe(true,);
    if (!("ok" in result)) {
      await db.destroy();
      return;
    }

    const { listOwnerUserIds, } = await import("./owners-core");
    expect(await listOwnerUserIds(db, result.newChatId,),).toEqual([CREATOR_ID, CO_OWNER_ID,].sort(),);
    expect(await listOwnerUserIds(db, CHAT_ID,),).toEqual([CREATOR_ID, CO_OWNER_ID,].sort(),);

    await db.destroy();
  });

  test("invariant: chat creation seeds exactly one owners row — the creator", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, `inv-${CREATOR_ID}`, "Inv", { id: CREATOR_ID, } as never,);
    await insertActors(db, "Inv", { id: CREATOR_ID, user_id: CREATOR_ID, owner_id: CREATOR_ID, } as never,);

    const { createChat, } = await import("./crud/create");
    const chatId = await createChat(db, { name: "Invariant Chat", createdBy: CREATOR_ID, },);

    const rows = await db.selectFrom("chat_owners",).select("user_id",).where("chat_id", "=", chatId,).execute();
    expect(rows.map((r,) => r.user_id),).toEqual([CREATOR_ID,],);

    await db.destroy();
  });
});
