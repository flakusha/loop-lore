// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for BUG-324a2c9: when a chat has an active conversation
 * branch, `listMessages` with no pinned parentId must serve the ACTIVE
 * BRANCH's root-to-tip path (so a branch switch swaps the displayed chain),
 * not every message row in the chat.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { ChatParticipantRole, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { forkBranch, } from "./branches";
import { listMessages, } from "./read";

describe("listMessages — active branch path (BUG-324a2c9)", () => {
  let tdb: TestDb;
  let ownerId: string;
  let chatId: string;
  let rootId: string;
  let forkId: string;
  let branchTipId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    const { db, } = tdb;

    ownerId = randomUUID();
    chatId = randomUUID();

    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertChats(db, "Branched", ownerId, { id: chatId, type: "direct", mode: "direct", } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);

    rootId = await insertMessages(db, chatId, ownerId, MessageRole.User, "root",);
    forkId = await insertMessages(
      db,
      chatId,
      ownerId,
      MessageRole.User,
      "fork point",
      { parent_id: rootId, } as never,
    );

    branchTipId = await insertMessages(
      db,
      chatId,
      ownerId,
      MessageRole.User,
      "branch tip",
      { parent_id: forkId, } as never,
    );

    const forked = await forkBranch(tdb.db, { chatId, messageId: forkId, actorId: ownerId, },);
    if ("code" in forked) { throw new Error(`fork failed: ${forked.code}`,); }
  },);

  afterAll(async () => {
    await tdb.db.destroy();
  },);

  test("unfiltered list serves the active branch's root-to-tip path only", async () => {
    const { data, total, } = await listMessages(tdb.db, { chatId, },);
    expect(total,).toBe(2,);
    expect(data.map((m,) => m.id),).toEqual([rootId, forkId,],);
    expect(data.map((m,) => m.id),).not.toContain(branchTipId,);
  });

  test("an explicit parentId filter bypasses the branch path", async () => {
    const { data, total, } = await listMessages(tdb.db, { chatId, parentId: rootId, },);
    expect(total,).toBe(1,);
    expect(data[0]?.id,).toBe(forkId,);
  });

  test("a chat without an active branch lists every visible message", async () => {
    const otherChat = randomUUID();
    const db: Kysely<DB> = tdb.db;
    await insertChats(db, "Plain", ownerId, { id: otherChat, type: "direct", mode: "direct", } as never,);
    await insertChatParticipants(db, otherChat, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    const m1 = await insertMessages(db, otherChat, ownerId, MessageRole.User, "one",);
    const m2 = await insertMessages(db, otherChat, ownerId, MessageRole.User, "two", { parent_id: m1, } as never,);

    const { data, total, } = await listMessages(db, { chatId: otherChat, },);
    expect(total,).toBe(2,);
    expect(data.map((m,) => m.id),).toEqual([m1, m2,],);
  });
});
