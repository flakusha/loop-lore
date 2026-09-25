/**
 * Tests for chat branching service (FEAT-045).
 *
 * Coverage:
 *   - fork from middle of a message chain returns root-to-fork-point path
 *   - fork default-name auto-increments ("Branch 1", "Branch 2", ...)
 *   - fork custom name respected
 *   - switch sets chats.active_branch_id
 *   - getMessagesForBranch returns root-to-tip ids
 *   - listBranches returns metadata + messageCount + lastActivity
 *   - cross-chat guards (fork message from a different chat → not_found,
 *     switch branchId from a different chat → not_found)
 *   - cross-user guards (non-participant → not_found; participant non-owner
 *     can fork)
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { ChatParticipantRole, MessageRole, } from "../../db/enums";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  forkBranch,
  getMessagesForBranch,
  listBranches,
  switchActiveBranch,
} from "./branches";

describe("chat branches (FEAT-045)", () => {
  let tdb: TestDb;
  let ownerId: string;
  let memberId: string;
  let strangerId: string;
  let chatId: string;
  let otherChatId: string;
  let rootId: string;
  let midId: string;
  let leafId: string;
  let otherChatMessageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    const { db, } = tdb;

    ownerId = randomUUID();
    memberId = randomUUID();
    strangerId = randomUUID();
    chatId = randomUUID();
    otherChatId = randomUUID();

    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `member-${memberId}`, "Member", { id: memberId, } as never,);
    await insertUsers(db, `stranger-${strangerId}`, "Stranger", { id: strangerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Member", { id: memberId, user_id: memberId, owner_id: memberId, } as never,);
    await insertActors(db, "Stranger", { id: strangerId, user_id: strangerId, owner_id: strangerId, } as never,);

    await insertChats(db, "Adventure", ownerId, { id: chatId, type: "direct", mode: "direct", } as never,);
    await insertChats(db, "Side Chat", ownerId, { id: otherChatId, type: "direct", mode: "direct", } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    await insertChatParticipants(db, chatId, memberId, { role_in_chat: ChatParticipantRole.Member, } as never,);

    rootId = await insertMessages(db, chatId, ownerId, MessageRole.User, "root",);
    midId = await insertMessages(
      db,
      chatId,
      memberId,
      MessageRole.Assistant,
      "middle",
      { parent_id: rootId, } as never,
    );
    leafId = await insertMessages(db, chatId, ownerId, MessageRole.User, "leaf", { parent_id: midId, } as never,);
    otherChatMessageId = await insertMessages(db, otherChatId, ownerId, MessageRole.User, "other",);
  },);

  afterAll(async () => {
    await tdb.db.destroy();
  },);

  test("fork from middle of message chain returns root-to-fork-point path", async () => {
    const result = await forkBranch(tdb.db, {
      chatId,
      messageId: midId,
      actorId: ownerId,
    },);
    if ("code" in result) { throw new Error(`Unexpected error: ${result.code} ${result.message}`,); }
    expect(result.branch.name,).toBe("Branch 1",);
    expect(result.branch.parentMessageId,).toBe(midId,);
    expect(result.branch.isActive,).toBe(true,);
    expect(result.messagePath,).toEqual([rootId, midId,],);
  });

  test("fork auto-naming increments Branch N", async () => {
    const second = await forkBranch(tdb.db, {
      chatId,
      messageId: leafId,
      actorId: ownerId,
    },);
    if ("code" in second) { throw new Error(`Unexpected error: ${second.code} ${second.message}`,); }
    expect(second.branch.name,).toBe("Branch 2",);
    expect(second.messagePath,).toEqual([rootId, midId, leafId,],);
  });

  test("fork accepts a custom name", async () => {
    const named = await forkBranch(tdb.db, {
      chatId,
      messageId: leafId,
      actorId: ownerId,
      name: "What if I had said no",
    },);
    if ("code" in named) { throw new Error(`Unexpected error: ${named.code} ${named.message}`,); }
    expect(named.branch.name,).toBe("What if I had said no",);
  });

  test("switch active branch updates chats.active_branch_id", async () => {
    const branches = await listBranches(tdb.db, chatId, ownerId,);
    if ("code" in branches) { throw new Error(`Unexpected error: ${branches.code} ${branches.message}`,); }
    const firstBranch = branches.branches[0]!;
    const result = await switchActiveBranch(tdb.db, {
      chatId,
      branchId: firstBranch.id,
      actorId: ownerId,
    },);
    if ("code" in result) { throw new Error(`Unexpected error: ${result.code} ${result.message}`,); }
    expect(result.activeBranchId,).toBe(firstBranch.id,);
    const row = await tdb.db
      .selectFrom("chats",)
      .select(["active_branch_id" as never,],)
      .where("id", "=", chatId,)
      .executeTakeFirst() as Record<string, unknown> | undefined;
    expect(String(row?.["active_branch_id" as never],),).toBe(firstBranch.id,);
  });

  test("getMessagesForBranch returns root-to-tip ids", async () => {
    const branches = await listBranches(tdb.db, chatId, ownerId,);
    if ("code" in branches) { throw new Error("expected ok",); }
    const midBranch = branches.branches.find((b,) => b.parentMessageId === midId);
    expect(midBranch,).toBeDefined();
    if (!midBranch) { return; }
    const path = await getMessagesForBranch(tdb.db, chatId, midBranch.id,);
    expect(path,).toEqual([rootId, midId,],);
  });

  test("listBranches returns metadata for all branches", async () => {
    const result = await listBranches(tdb.db, chatId, ownerId,);
    if ("code" in result) { throw new Error(`Unexpected error: ${result.code} ${result.message}`,); }
    expect(result.branches.length,).toBeGreaterThanOrEqual(2,);
    for (const b of result.branches) {
      expect(b.messageCount,).toBeGreaterThan(0,);
      expect(b.lastActivity,).toBeTruthy();
    }
  });

  test("non-participant cannot list branches (not_found)", async () => {
    const result = await listBranches(tdb.db, chatId, strangerId,);
    expect("code" in result && result.code === "not_found",).toBe(true,);
  });

  test("fork rejects a message from a different chat (not_found)", async () => {
    const result = await forkBranch(tdb.db, {
      chatId,
      messageId: otherChatMessageId,
      actorId: ownerId,
    },);
    expect("code" in result && result.code === "not_found",).toBe(true,);
  });

  test("switch rejects a branchId from a different chat (not_found)", async () => {
    const branches = await listBranches(tdb.db, chatId, ownerId,);
    if ("code" in branches) { throw new Error("expected ok",); }
    const target = branches.branches[0]!.id;
    const result = await switchActiveBranch(tdb.db, {
      chatId: otherChatId,
      branchId: target,
      actorId: ownerId,
    },);
    expect("code" in result && result.code === "not_found",).toBe(true,);
  });

  test("participant (non-owner) can fork", async () => {
    const result = await forkBranch(tdb.db, {
      chatId,
      messageId: rootId,
      actorId: memberId,
    },);
    if ("code" in result) { throw new Error(`Unexpected error: ${result.code} ${result.message}`,); }
    expect(result.branch.chatId,).toBe(chatId,);
  });
});
