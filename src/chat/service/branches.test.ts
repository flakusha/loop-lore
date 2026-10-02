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

  test("fork moves the display: chats.active_branch_id + single active row", async () => {
    const forked = await forkBranch(tdb.db, {
      chatId,
      messageId: midId,
      actorId: ownerId,
      name: "Active sync",
    },);

    if ("code" in forked) { throw new Error(`Unexpected error: ${forked.code} ${forked.message}`,); }
    const row = await tdb.db
      .selectFrom("chats",)
      .select(["active_branch_id",],)
      .where("id", "=", chatId,)
      .executeTakeFirst();

    expect(row?.active_branch_id,).toBe(forked.branch.id,);
    const activeRows = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("chat_id", "=", chatId,)
      .where("is_active", "=", 1,)
      .execute();

    expect(activeRows,).toHaveLength(1,);
    expect(activeRows[0]?.id,).toBe(forked.branch.id,);
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
    const path = await getMessagesForBranch(tdb.db, chatId, midBranch.id, ownerId,);
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

  test("display invariant: fork demotes the previous active row", async () => {
    const invChatId = randomUUID();
    await insertChats(tdb.db, "Invariant Chat", ownerId, { id: invChatId, type: "direct", mode: "direct", } as never,);
    await insertChatParticipants(tdb.db, invChatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    const msgA = await insertMessages(tdb.db, invChatId, ownerId, MessageRole.User, "a",);
    const msgB = await insertMessages(
      tdb.db,
      invChatId,
      ownerId,
      MessageRole.User,
      "b",
      { parent_id: msgA, } as never,
    );

    const first = await forkBranch(tdb.db, { chatId: invChatId, messageId: msgA, actorId: ownerId, },);
    if ("code" in first) { throw new Error("expected ok",); }
    const second = await forkBranch(tdb.db, { chatId: invChatId, messageId: msgB, actorId: ownerId, },);
    if ("code" in second) { throw new Error("expected ok",); }

    const actives = await tdb.db
      .selectFrom("chat_branches",)
      .select("id",)
      .where("chat_id", "=", invChatId,)
      .where("is_active", "=", 1,)
      .execute();
    expect(actives.map((r,) => r.id),).toEqual([second.branch.id,],);
  });

  test("fork syncs chats.active_branch_id with the new branch row", async () => {
    const invChatId = randomUUID();
    await insertChats(
      tdb.db,
      "ActiveBranchSync Chat",
      ownerId,
      { id: invChatId, type: "direct", mode: "direct", } as never,
    );
    await insertChatParticipants(tdb.db, invChatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    const msgA = await insertMessages(tdb.db, invChatId, ownerId, MessageRole.User, "a",);
    const msgB = await insertMessages(
      tdb.db,
      invChatId,
      ownerId,
      MessageRole.User,
      "b",
      { parent_id: msgA, } as never,
    );

    const first = await forkBranch(tdb.db, { chatId: invChatId, messageId: msgA, actorId: ownerId, },);
    if ("code" in first) { throw new Error("expected ok",); }

    const chatAfterFirst = await tdb.db
      .selectFrom("chats",)
      .select("active_branch_id",)
      .where("id", "=", invChatId,)
      .executeTakeFirst();
    expect(chatAfterFirst?.active_branch_id,).toBe(first.branch.id,);

    const second = await forkBranch(tdb.db, { chatId: invChatId, messageId: msgB, actorId: ownerId, },);
    if ("code" in second) { throw new Error("expected ok",); }

    const chatAfterSecond = await tdb.db
      .selectFrom("chats",)
      .select("active_branch_id",)
      .where("id", "=", invChatId,)
      .executeTakeFirst();
    expect(chatAfterSecond?.active_branch_id,).toBe(second.branch.id,);
  });

  test("fork syncs chats.active_branch_id with the new branch row", async () => {
    const invChatId = randomUUID();
    await insertChats(
      tdb.db,
      "ActiveBranchSync Chat",
      ownerId,
      { id: invChatId, type: "direct", mode: "direct", } as never,
    );

    await insertChatParticipants(tdb.db, invChatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    const msgA = await insertMessages(tdb.db, invChatId, ownerId, MessageRole.User, "a",);
    const msgB = await insertMessages(
      tdb.db,
      invChatId,
      ownerId,
      MessageRole.User,
      "b",
      { parent_id: msgA, } as never,
    );

    const first = await forkBranch(tdb.db, { chatId: invChatId, messageId: msgA, actorId: ownerId, },);
    if ("code" in first) { throw new Error("expected ok",); }

    const chatAfterFirst = await tdb.db
      .selectFrom("chats",)
      .select("active_branch_id",)
      .where("id", "=", invChatId,)
      .executeTakeFirst();

    expect(chatAfterFirst?.active_branch_id,).toBe(first.branch.id,);

    const second = await forkBranch(tdb.db, { chatId: invChatId, messageId: msgB, actorId: ownerId, },);
    if ("code" in second) { throw new Error("expected ok",); }

    const chatAfterSecond = await tdb.db
      .selectFrom("chats",)
      .select("active_branch_id",)
      .where("id", "=", invChatId,)
      .executeTakeFirst();

    expect(chatAfterSecond?.active_branch_id,).toBe(second.branch.id,);
  });

  test("display invariant: switch syncs per-row flags with active_branch_id", async () => {
    const branches = await listBranches(tdb.db, chatId, ownerId,);
    if ("code" in branches) { throw new Error("expected ok",); }
    const target = branches.branches[0]!;
    const result = await switchActiveBranch(tdb.db, {
      chatId,
      branchId: target.id,
      actorId: ownerId,
    },);
    expect("code" in result,).toBe(false,);

    const actives = await tdb.db
      .selectFrom("chat_branches",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .where("is_active", "=", 1,)
      .execute();
    expect(actives.map((r,) => r.id),).toEqual([target.id,],);
  });

  test("the branch walk stops at a foreign chat's message — no cross-chat leak", async () => {
    const foreignRoot = await insertMessages(tdb.db, otherChatId, ownerId, MessageRole.User, "foreign root",);
    // Plant a messages row whose parent_id chain crosses into `otherChatId`.
    // The FK permits any message id, so only the walk's own chat check stops
    // it — without that check this id chain leaks the foreign message.
    const crossing = await insertMessages(
      tdb.db,
      chatId,
      ownerId,
      MessageRole.User,
      "crossing",
      { parent_id: foreignRoot, } as never,
    );

    const forked = await forkBranch(tdb.db, { chatId, messageId: crossing, actorId: ownerId, },);
    if ("code" in forked) { throw new Error("expected ok",); }

    const path = await getMessagesForBranch(tdb.db, chatId, forked.branch.id, ownerId,);
    expect(path,).toEqual([crossing,],);
    expect(path.includes(foreignRoot,),).toBe(false,);
    // The same guard must hold for the branch's advertised metadata.
    const listed = await listBranches(tdb.db, chatId, ownerId,);
    if ("code" in listed) { throw new Error("expected ok",); }
    const row = listed.branches.find((b,) => b.id === forked.branch.id);
    expect(row?.messageCount,).toBe(1,);
  });

  test("listBranches reports exact messageCount and the tip's created_at", async () => {
    const stamp = "2026-03-03T00:00:00.000Z";
    const invChatId = randomUUID();
    await insertChats(tdb.db, "Meta Chat", ownerId, { id: invChatId, type: "direct", mode: "direct", } as never,);
    await insertChatParticipants(tdb.db, invChatId, ownerId, { role_in_chat: ChatParticipantRole.Owner, } as never,);
    const m1 = await insertMessages(tdb.db, invChatId, ownerId, MessageRole.User, "m1", {
      created_at: "2026-03-01T00:00:00.000Z",
    },);

    const m2 = await insertMessages(tdb.db, invChatId, ownerId, MessageRole.Assistant, "m2", {
      parent_id: m1,
      created_at: "2026-03-02T00:00:00.000Z",
    },);

    const m3 = await insertMessages(tdb.db, invChatId, ownerId, MessageRole.User, "m3", {
      parent_id: m2,
      created_at: stamp,
    },);

    await forkBranch(tdb.db, { chatId: invChatId, messageId: m1, actorId: ownerId, },);
    await forkBranch(tdb.db, { chatId: invChatId, messageId: m3, actorId: ownerId, },);

    const result = await listBranches(tdb.db, invChatId, ownerId,);
    if ("code" in result) { throw new Error(`Unexpected error: ${result.code} ${result.message}`,); }
    const byTip = new Map(result.branches.map((b,) => [b.parentMessageId, b,]),);
    expect(byTip.get(m1,)?.messageCount,).toBe(1,);
    expect(byTip.get(m3,)?.messageCount,).toBe(3,);
    // lastActivity is the TIP's created_at exactly — a hardcoded literal
    // would sail through a `toBeTruthy()` check.
    expect(byTip.get(m3,)?.lastActivity,).toBe(stamp,);
    expect(byTip.get(m1,)?.lastActivity,).toBe("2026-03-01T00:00:00.000Z",);
  });
});
