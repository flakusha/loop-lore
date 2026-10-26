// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for BUG-12f087e: getChat resolves the chat's primary
 * character actor (first non-user participant by join order) so the detail
 * route can emit `character_id` for the impersonation toggle.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { ChatParticipantRole, } from "../../../db/enums";
import { createLogger, } from "../../../logger";
import { createTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import { getChat, } from "./get";

describe("getChat — character_id resolution (BUG-12f087e)", () => {
  let tdb: TestDb;
  let ownerId: string;
  let charA: string;
  let charB: string;
  let userActor: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    const { db, } = tdb;

    ownerId = randomUUID();
    charA = randomUUID();
    charB = randomUUID();
    userActor = randomUUID();
    chatId = randomUUID();

    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Aria", { id: charA, user_id: null, owner_id: ownerId, actor_type: "character", } as never,);
    await insertActors(db, "Bree", { id: charB, user_id: null, owner_id: ownerId, actor_type: "character", } as never,);
    await insertActors(
      db,
      "Owner",
      { id: userActor, user_id: ownerId, owner_id: ownerId, actor_type: "user", } as never,
    );

    await insertChats(db, "Chat", ownerId, { id: chatId, type: "direct", mode: "direct", } as never,);
    // Join order matters: the user actor joins first, the character second —
    // the primary character is the FIRST NON-USER participant.
    await insertChatParticipants(db, chatId, userActor, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    await insertChatParticipants(db, chatId, charA, { role_in_chat: ChatParticipantRole.Member, } as never,);
    await insertChatParticipants(db, chatId, charB, { role_in_chat: ChatParticipantRole.Member, } as never,);
  },);

  afterAll(async () => {
    await tdb.db.destroy();
  },);

  test("resolves the first non-user participant as characterId", async () => {
    const result = await getChat(tdb.db, chatId,);
    expect(result,).not.toBeNull();
    expect(result!.characterId,).toBe(charA,);
  });

  test("returns null characterId for a user-only chat", async () => {
    const otherChat = randomUUID();
    await insertChats(tdb.db, "Solo", ownerId, { id: otherChat, type: "direct", mode: "direct", } as never,);
    await insertChatParticipants(tdb.db, otherChat, userActor, { role_in_chat: ChatParticipantRole.Owner, } as never,);

    const result = await getChat(tdb.db, otherChat,);
    expect(result,).not.toBeNull();
    expect(result!.characterId,).toBeNull();
  });
});
