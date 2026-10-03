/**
 * Tests for branch navigation service (FEAT-046).
 *
 * Covers branch detail, rename/activate, the delete and merge guards,
 * merge re-parenting (including source-row consumption), and keyset
 * pagination. Every test seeds its own chat so the one-active-branch
 * invariant cannot leak between cases.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type KyselyPlugin, type RootOperationNode, TableNode, } from "kysely";
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
import { deleteBranch, getBranch, renameBranch, } from "./branch-crud";
import { walkMessagePath, } from "./branch-helpers";
import { listBranchesPage, } from "./branch-list";
import { mergeBranch, } from "./branch-merge";
import { forkBranch, switchActiveBranch, } from "./branches";
import type { ServiceError, } from "./types";

/** Assert a Result succeeded, failing the test with the service's own code. */
function ok<T extends { ok: true },>(result: T | ServiceError,): T {
  if ("code" in result) { throw new Error(`Unexpected error: ${result.code} ${result.message}`,); }
  return result;
}

/** Assert a Result failed with `code`. */
function failsWith<T extends { ok: true },>(result: T | ServiceError, code: ServiceError["code"],) {
  expect("code" in result && result.code === code,).toBe(true,);
}

describe("branch navigation (FEAT-046)", () => {
  let tdb: TestDb;
  let ownerId: string;

  /** Fresh chat owned by `ownerId` with `ownerId` as its only participant. */
  async function newChat(prefix: string,): Promise<string> {
    const chatId = randomUUID();
    await insertChats(tdb.db, prefix, ownerId, { id: chatId, type: "direct", mode: "direct", } as never,);
    await insertChatParticipants(
      tdb.db,
      chatId,
      ownerId,
      { role_in_chat: ChatParticipantRole.Owner, } as never,
    );
    return chatId;
  }

  /** Insert a message under `parentId` (omitted = chat root); returns its id. */
  async function msg(chatId: string, content: string, parentId?: string,): Promise<string> {
    return insertMessages(
      tdb.db,
      chatId,
      ownerId,
      MessageRole.User,
      content,
      parentId ? { parent_id: parentId, } as never : undefined,
    );
  }

  /** Fork `messageId` and return the new branch id (forking makes it active). */
  async function fork(chatId: string, messageId: string,): Promise<string> {
    return ok(await forkBranch(tdb.db, { chatId, messageId, actorId: ownerId, },),).branch.id;
  }

  beforeAll(async () => {
    createLogger({ level: "error", },);
    tdb = await createTestDb();
    ownerId = randomUUID();
    await insertUsers(tdb.db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(
      tdb.db,
      "Owner",
      { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,
    );
  },);

  afterAll(async () => {
    await tdb.db.destroy();
  },);

  test("getBranch returns the record plus its root-to-tip message path", async () => {
    const chatId = await newChat("Detail",);
    const rootId = await msg(chatId, "root",);
    const midId = await msg(chatId, "mid", rootId,);
    const branchId = await fork(chatId, midId,);

    const result = ok(await getBranch(tdb.db, { chatId, branchId, actorId: ownerId, },),);
    expect(result.branch.name,).toBe("Branch 1",);
    expect(result.branch.parentMessageId,).toBe(midId,);
    expect(result.branch.isActive,).toBe(true,);
    expect(result.branch.messageCount,).toBe(2,);
    expect(result.messagePath,).toEqual([rootId, midId,],);
  });

  test("getBranch rejects a branch owned by another chat (not_found)", async () => {
    const chatA = await newChat("Scoped A",);
    const chatB = await newChat("Scoped B",);
    const branchId = await fork(chatA, await msg(chatA, "root",),);

    failsWith(
      await getBranch(tdb.db, { chatId: chatB, branchId, actorId: ownerId, },),
      "not_found",
    );
  });

  test("rename applies the trimmed new name", async () => {
    const chatId = await newChat("Rename",);
    const branchId = await fork(chatId, await msg(chatId, "root",),);

    const renamed = ok(
      await renameBranch(tdb.db, { chatId, branchId, actorId: ownerId, name: "  Say no  ", },),
    );
    expect(renamed.branch.name,).toBe("Say no",);
    const row = await tdb.db
      .selectFrom("chat_branches",)
      .select(["name",],)
      .where("id", "=", branchId,)
      .executeTakeFirst();
    expect(row?.name,).toBe("Say no",);
  });

  test("rename with a supplied blank name is rejected and changes nothing (bad_request)", async () => {
    const chatId = await newChat("Blank",);
    const branchId = await fork(chatId, await msg(chatId, "root",),);

    failsWith(
      await renameBranch(tdb.db, { chatId, branchId, actorId: ownerId, name: "   ", },),
      "bad_request",
    );
    const row = await tdb.db
      .selectFrom("chat_branches",)
      .select(["name",],)
      .where("id", "=", branchId,)
      .executeTakeFirst();
    expect(row?.name,).toBe("Branch 1",);
  });

  test("rename onto a name already used in the chat is refused and changes nothing", async () => {
    const chatId = await newChat("Rename dup",);
    const rootId = await msg(chatId, "root",);
    const first = await fork(chatId, rootId,);
    const second = await fork(chatId, await msg(chatId, "alt", rootId,),);
    ok(await renameBranch(tdb.db, { chatId, branchId: first, actorId: ownerId, name: "Alt", },),);

    failsWith(
      await renameBranch(tdb.db, { chatId, branchId: second, actorId: ownerId, name: "Alt", },),
      "bad_request",
    );
    const row = await tdb.db
      .selectFrom("chat_branches",)
      .select(["name",],)
      .where("id", "=", second,)
      .executeTakeFirst();
    expect(row?.name,).toBe("Branch 2",);
  });

  test("rename with activate switches the chat's displayed branch", async () => {
    const chatId = await newChat("Activate",);
    const rootId = await msg(chatId, "root",);
    const first = await fork(chatId, rootId,);
    const second = await fork(chatId, await msg(chatId, "alt", rootId,),);

    const result = ok(
      await renameBranch(tdb.db, { chatId, branchId: first, actorId: ownerId, name: "Chosen", activate: true, },),
    );
    expect(result.branch.name,).toBe("Chosen",);
    expect(result.branch.isActive,).toBe(true,);

    const chat = await tdb.db
      .selectFrom("chats",)
      .select(["active_branch_id",],)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    expect(chat?.active_branch_id,).toBe(first,);
    const demoted = await tdb.db
      .selectFrom("chat_branches",)
      .select(["is_active",],)
      .where("id", "=", second,)
      .executeTakeFirst();
    expect(demoted?.is_active,).toBe(0,);
  });

  test("delete removes a non-displayed branch", async () => {
    const chatId = await newChat("Delete",);
    const rootId = await msg(chatId, "root",);
    const stale = await fork(chatId, rootId,);
    await fork(chatId, await msg(chatId, "alt", rootId,),);

    const result = ok(await deleteBranch(tdb.db, { chatId, branchId: stale, actorId: ownerId, },),);
    expect(result.deletedBranchId,).toBe(stale,);
    const row = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", stale,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("delete refuses the displayed branch until another one is active", async () => {
    const chatId = await newChat("Delete active",);
    const rootId = await msg(chatId, "root",);
    const stale = await fork(chatId, rootId,);
    const displayed = await fork(chatId, await msg(chatId, "alt", rootId,),);

    failsWith(await deleteBranch(tdb.db, { chatId, branchId: displayed, actorId: ownerId, },), "bad_request",);
    const kept = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", displayed,)
      .executeTakeFirst();
    expect(kept,).toBeDefined();

    // The chat must point elsewhere, not merely flip the row flag.
    ok(await switchActiveBranch(tdb.db, { chatId, branchId: stale, actorId: ownerId, },),);
    ok(await deleteBranch(tdb.db, { chatId, branchId: displayed, actorId: ownerId, },),);
  });

  test("merge re-parents the source's exclusive chain and consumes the source row", async () => {
    // root ─┬─ a ─ a1 ─ a2        (source line, forked at `a`)
    //       └─ b ─ b1            (target line, forked at `b1`)
    const chatId = await newChat("Merge",);
    const rootId = await msg(chatId, "root",);
    const aId = await msg(chatId, "a", rootId,);
    const a1Id = await msg(chatId, "a1", aId,);
    const a2Id = await msg(chatId, "a2", a1Id,);
    const bId = await msg(chatId, "b", rootId,);
    const b1Id = await msg(chatId, "b1", bId,);
    const target = await fork(chatId, b1Id,);
    const source = await fork(chatId, aId,);
    // Forking made the source the displayed one; hand the chat back to the
    // target so the merge consumes a non-displayed branch.
    ok(await switchActiveBranch(tdb.db, { chatId, branchId: target, actorId: ownerId, },),);

    const result = ok(
      await mergeBranch(tdb.db, { chatId, branchId: source, actorId: ownerId, intoBranchId: target, },),
    );
    expect(result.movedMessageIds,).toEqual([aId, a1Id, a2Id,],);
    expect(result.sourceBranchId,).toBe(source,);
    expect(result.targetBranchId,).toBe(target,);
    expect(result.deletedSourceBranchId,).toBe(source,);

    const rows = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id", "parent_message_id",],)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(rows.map((r,) => r.id),).toEqual([target,],);
    expect(rows[0]?.parent_message_id,).toBe(a2Id,);
    expect(await walkMessagePath(tdb.db, chatId, a2Id,),).toEqual([
      rootId,
      bId,
      b1Id,
      aId,
      a1Id,
      a2Id,
    ],);
  });

  test("merge keeps sibling subtrees of the fork point as siblings", async () => {
    // root ─┬─ p ─┬─ x ─ x1     (source line, forked at `p`; `p` has TWO
    //       │     └─ y ─ y1      independent children, each with a child)
    //       └─ q ─ q1            (target line, forked at `q1`)
    const chatId = await newChat("Merge siblings",);
    const rootId = await msg(chatId, "root",);
    const pId = await msg(chatId, "p", rootId,);
    const xId = await msg(chatId, "x", pId,);
    const x1Id = await msg(chatId, "x1", xId,);
    const yId = await msg(chatId, "y", pId,);
    const y1Id = await msg(chatId, "y1", yId,);
    const qId = await msg(chatId, "q", rootId,);
    const q1Id = await msg(chatId, "q1", qId,);
    const target = await fork(chatId, q1Id,);
    const source = await fork(chatId, pId,);
    ok(await switchActiveBranch(tdb.db, { chatId, branchId: target, actorId: ownerId, },),);

    ok(
      await mergeBranch(tdb.db, { chatId, branchId: source, actorId: ownerId, intoBranchId: target, },),
    );

    // Only the fork point itself may be re-parented onto the target tip.
    // Chaining the moved ids in walk order would make `y` a child of `x` and
    // hang `x1` off `y1`, silently flattening two independent branches into
    // one line.
    const parents = await tdb.db
      .selectFrom("messages",)
      .select(["id", "parent_id",],)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(new Map(parents.map((r,) => [r.id, r.parent_id,]),),).toEqual(
      new Map([
        [pId, q1Id,],
        [xId, pId,],
        [x1Id, xId,],
        [yId, pId,],
        [y1Id, yId,],
        [qId, rootId,],
        [q1Id, qId,],
        [rootId, null,],
      ],),
    );

    // Each descendant still reaches the root through its OWN line, so the
    // merge orphaned neither subtree. Walked from the leaves rather than the
    // branch tip: which sibling becomes the tip is branch-merge's choice.
    expect(await walkMessagePath(tdb.db, chatId, x1Id,),).toEqual([
      rootId,
      qId,
      q1Id,
      pId,
      xId,
      x1Id,
    ],);
    expect(await walkMessagePath(tdb.db, chatId, y1Id,),).toEqual([
      rootId,
      qId,
      q1Id,
      pId,
      yId,
      y1Id,
    ],);
  });

  test("merge refuses merging a branch into itself", async () => {
    const chatId = await newChat("Self merge",);
    const branchId = await fork(chatId, await msg(chatId, "root",),);

    failsWith(
      await mergeBranch(tdb.db, { chatId, branchId, actorId: ownerId, intoBranchId: branchId, },),
      "bad_request",
    );
  });

  test("merge refuses the displayed branch until another one is active", async () => {
    const chatId = await newChat("Merge active",);
    const rootId = await msg(chatId, "root",);
    const aId = await msg(chatId, "a", rootId,);
    const a1Id = await msg(chatId, "a1", aId,);
    const bId = await msg(chatId, "b", rootId,);
    const b1Id = await msg(chatId, "b1", bId,);
    const target = await fork(chatId, b1Id,);
    // Forking last leaves the source displayed; consuming it orphans the chat.
    const source = await fork(chatId, aId,);

    failsWith(
      await mergeBranch(tdb.db, { chatId, branchId: source, actorId: ownerId, intoBranchId: target, },),
      "bad_request",
    );
    const kept = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", source,)
      .executeTakeFirst();
    expect(kept,).toBeDefined();

    ok(await switchActiveBranch(tdb.db, { chatId, branchId: target, actorId: ownerId, },),);
    const merged = ok(
      await mergeBranch(tdb.db, { chatId, branchId: source, actorId: ownerId, intoBranchId: target, },),
    );
    expect(merged.movedMessageIds,).toEqual([aId, a1Id,],);
  });

  test("merge with no intoBranchId lands in the chat's displayed branch", async () => {
    const chatId = await newChat("Merge default",);
    const rootId = await msg(chatId, "root",);
    const aId = await msg(chatId, "a", rootId,);
    const a1Id = await msg(chatId, "a1", aId,);
    const bId = await msg(chatId, "b", rootId,);
    const b1Id = await msg(chatId, "b1", bId,);
    const target = await fork(chatId, b1Id,);
    const source = await fork(chatId, aId,);
    ok(await switchActiveBranch(tdb.db, { chatId, branchId: target, actorId: ownerId, },),);

    const merged = ok(await mergeBranch(tdb.db, { chatId, branchId: source, actorId: ownerId, },),);
    expect(merged.targetBranchId,).toBe(target,);
    expect(merged.movedMessageIds,).toEqual([aId, a1Id,],);
    expect(await walkMessagePath(tdb.db, chatId, a1Id,),).toEqual([rootId, bId, b1Id, aId, a1Id,],);
  });

  test("merge refuses a source with nothing to move", async () => {
    const chatId = await newChat("Merge empty",);
    const rootId = await msg(chatId, "root",);
    const midId = await msg(chatId, "mid", rootId,);
    // Both branches fork at the same node, so every source descendant is
    // already on the target's path: the exclusive subtree is empty.
    const target = await fork(chatId, midId,);
    const source = await fork(chatId, midId,);
    ok(await switchActiveBranch(tdb.db, { chatId, branchId: target, actorId: ownerId, },),);

    failsWith(
      await mergeBranch(tdb.db, { chatId, branchId: source, actorId: ownerId, intoBranchId: target, },),
      "bad_request",
    );
    // The user-visible branch survives a refused no-op merge.
    const kept = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", source,)
      .executeTakeFirst();
    expect(kept,).toBeDefined();
  });

  test("merge refuses a subtree past the 2000-node ceiling before writing", async () => {
    const chatId = await newChat("Merge ceiling",);
    const rootId = await msg(chatId, "root",);
    const bId = await msg(chatId, "b", rootId,);
    const b1Id = await msg(chatId, "b1", bId,);
    const aId = await msg(chatId, "a", rootId,);

    // 2100 chained messages hang off `a` — past the ceiling. Batched to stay
    // well under SQLite's bound-parameter limit.
    let parent = aId;
    for (let batch = 0; batch < 2100; batch += 300) {
      const count = Math.min(300, 2100 - batch,);
      const rows = Array.from({ length: count, }, (_, i,) => {
        const id = randomUUID();
        const row = {
          id,
          chat_id: chatId,
          actor_id: ownerId,
          parent_id: parent,
          role: MessageRole.User,
          content: `d${batch + i}`,
        };
        parent = id;
        return row;
      },);
      await tdb.db.insertInto("messages",).values(rows,).execute();
    }

    const target = await fork(chatId, b1Id,);
    const source = await fork(chatId, aId,);
    ok(await switchActiveBranch(tdb.db, { chatId, branchId: target, actorId: ownerId, },),);

    failsWith(
      await mergeBranch(tdb.db, { chatId, branchId: source, actorId: ownerId, intoBranchId: target, },),
      "bad_request",
    );
    // Rejected BEFORE any write: `a` still points at root, not at the target.
    const untouched = await tdb.db
      .selectFrom("messages",)
      .select(["parent_id",],)
      .where("id", "=", aId,)
      .executeTakeFirst();
    expect(untouched?.parent_id,).toBe(rootId,);
  });

  test("listBranchesPage walks the cursor across boundaries and ends with a null cursor", async () => {
    const chatId = await newChat("Paging",);
    let prev = await msg(chatId, "root",);
    const tips: string[] = [];
    for (let i = 0; i < 5; i++) {
      prev = await msg(chatId, `m${i}`, prev,);
      tips.push(prev,);
    }
    for (const tip of tips) { await fork(chatId, tip,); }

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = ok(await listBranchesPage(tdb.db, { chatId, actorId: ownerId, limit: 2, cursor, },),);
      pages += 1;
      seen.push(...page.branches.map((b,) => b.id),);
      if (!page.nextCursor) { break; }
      cursor = page.nextCursor;
    }
    expect(pages,).toBe(3,);
    expect(seen.length,).toBe(5,);
    expect(new Set(seen,).size,).toBe(5,);

    const last = ok(await listBranchesPage(tdb.db, { chatId, actorId: ownerId, limit: 2, cursor, },),);
    expect(last.branches.length,).toBe(1,);
    expect(last.nextCursor,).toBeNull();
  });

  test("listBranchesPage treats a corrupt cursor as the first page", async () => {
    const chatId = await newChat("Corrupt",);
    const rootId = await msg(chatId, "root",);
    await msg(chatId, "child", rootId,);
    await fork(chatId, rootId,);
    const first = ok(await listBranchesPage(tdb.db, { chatId, actorId: ownerId, },),);

    // `!!!!` is outside the base64url alphabet; the strict decoder rejects the
    // whole string rather than skipping the junk and parsing the remainder.
    const corrupt = ok(
      await listBranchesPage(tdb.db, { chatId, actorId: ownerId, cursor: "!!!!not-a-cursor", },),
    );
    expect(corrupt.branches.map((b,) => b.id),).toEqual(first.branches.map((b,) => b.id),);
    expect(corrupt.nextCursor,).toBe(first.nextCursor,);
  });

  test("listBranchesPage refuses a cursor with junk wrapped around a real payload", async () => {
    const chatId = await newChat("Tampered",);
    let prev = await msg(chatId, "root",);
    for (let i = 0; i < 4; i++) {
      prev = await msg(chatId, `m${i}`, prev,);
      await fork(chatId, prev,);
    }
    const firstPage = ok(await listBranchesPage(tdb.db, { chatId, actorId: ownerId, limit: 2, },),);
    expect(firstPage.nextCursor,).toBeTruthy();

    // A lenient base64url decode SKIPS the junk and recovers the inner
    // payload, silently resuming mid-list from a boundary the server never
    // issued. Both junk-prefixed and junk-suffixed variants must degrade.
    for (const tampered of [`!!${firstPage.nextCursor}`, `${firstPage.nextCursor}!!`,]) {
      const page = ok(
        await listBranchesPage(tdb.db, { chatId, actorId: ownerId, limit: 2, cursor: tampered, },),
      );
      expect(page.branches.map((b,) => b.id),).toEqual(firstPage.branches.map((b,) => b.id),);
    }

    // The untampered cursor must still round-trip and advance.
    const roundTrip = ok(
      await listBranchesPage(tdb.db, { chatId, actorId: ownerId, limit: 2, cursor: firstPage.nextCursor!, },),
    );
    expect(roundTrip.branches.length,).toBe(2,);
    expect(roundTrip.branches.map((b,) => b.id),).not.toEqual(firstPage.branches.map((b,) => b.id),);
  });

  test("listBranchesPage clamps the page size to 100 and resumes past the boundary", async () => {
    const chatId = await newChat("Clamp",);
    const rootId = await msg(chatId, "root",);
    // A shared timestamp forces the id tie-break the cursor encodes.
    await tdb.db
      .insertInto("chat_branches",)
      .values(
        Array.from({ length: 101, }, (_, i,) => ({
          id: randomUUID(),
          chat_id: chatId,
          parent_message_id: rootId,
          name: `B${i}`,
          created_at: "2026-01-01 00:00:00",
          is_active: 0,
        }),),
      )
      .execute();

    const page = ok(await listBranchesPage(tdb.db, { chatId, actorId: ownerId, limit: 5000, },),);
    expect(page.branches.length,).toBe(100,);
    expect(page.nextCursor,).toBeTruthy();

    const rest = ok(
      await listBranchesPage(tdb.db, { chatId, actorId: ownerId, limit: 5000, cursor: page.nextCursor!, },),
    );
    expect(rest.branches.length,).toBe(1,);
    expect(rest.nextCursor,).toBeNull();
  });

  test("listBranchesPage treats a valid base64url cursor with invalid JSON as the first page", async () => {
    const chatId = await newChat("BadJson",);
    const rootId = await msg(chatId, "root",);
    await fork(chatId, rootId,);
    const first = ok(await listBranchesPage(tdb.db, { chatId, actorId: ownerId, },),);

    // Valid base64url that decodes to something that is not JSON.
    const badJson = Buffer.from("not json", "utf8",).toString("base64url",);
    const page = ok(
      await listBranchesPage(tdb.db, { chatId, actorId: ownerId, cursor: badJson, },),
    );
    expect(page.branches.map((b,) => b.id),).toEqual(first.branches.map((b,) => b.id),);
    expect(page.nextCursor,).toBe(first.nextCursor,);
  });

  test("listBranchesPage treats a cursor with missing fields as the first page", async () => {
    const chatId = await newChat("MissingFields",);
    const rootId = await msg(chatId, "root",);
    await fork(chatId, rootId,);
    const first = ok(await listBranchesPage(tdb.db, { chatId, actorId: ownerId, },),);

    // Valid base64url + valid JSON, but missing `createdAt` / `id`.
    const missing = Buffer.from(JSON.stringify({ foo: "bar", },), "utf8",).toString("base64url",);
    const page = ok(
      await listBranchesPage(tdb.db, { chatId, actorId: ownerId, cursor: missing, },),
    );
    expect(page.branches.map((b,) => b.id),).toEqual(first.branches.map((b,) => b.id),);
    expect(page.nextCursor,).toBe(first.nextCursor,);
  });

  test("merge refuses when the chat has no active branch", async () => {
    const chatId = await newChat("NoActive",);
    const rootId = await msg(chatId, "root",);
    const aId = await msg(chatId, "a", rootId,);
    const source = await fork(chatId, aId,);
    // Simulate a chat with no active branch: clear both active signals.
    await tdb.db.updateTable("chats",).set({ active_branch_id: null, },).where("id", "=", chatId,).execute();
    await tdb.db.updateTable("chat_branches",).set({ is_active: 0, },).where("id", "=", source,).execute();

    failsWith(
      await mergeBranch(tdb.db, { chatId, branchId: source, actorId: ownerId, },),
      "bad_request",
    );
  });

  test("delete refuses a branch when is_active=1 but active_branch_id is NULL (desync)", async () => {
    const chatId = await newChat("Desync",);
    const rootId = await msg(chatId, "root",);
    const branchId = await fork(chatId, rootId,);
    // Simulate a desynced pair: row flag says active, chat pointer is NULL.
    await tdb.db.updateTable("chats",).set({ active_branch_id: null, },).where("id", "=", chatId,).execute();

    failsWith(await deleteBranch(tdb.db, { chatId, branchId, actorId: ownerId, },), "bad_request",);
    const kept = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", branchId,)
      .executeTakeFirst();
    expect(kept,).toBeDefined();
  });

  // ── concurrency regressions (FEAT-046 hardening) ──────────────
  //
  // The interleavings below are real writes against the real database, fired
  // from a Kysely plugin at a real point in the query sequence — the code under
  // test is not stubbed or mocked, only time is skewed. The writes go through
  // the raw handle: a nested Kysely query would re-enter the driver the running
  // transaction already holds.

  /** True when `node` is a SELECT whose FROM includes `table`. */
  function selectsFrom(node: RootOperationNode, table: string,): boolean {
    if (node.kind !== "SelectQueryNode") { return false; }
    return node.from?.froms.some((from,) => TableNode.is(from,) && JSON.stringify(from,).includes(table,)) ?? false;
  }

  /** True when `node` is a SELECT projecting `chats.active_branch_id`. */
  function selectsActivePointer(node: RootOperationNode,): boolean {
    return node.kind === "SelectQueryNode" && JSON.stringify(node.selections,).includes("active_branch_id",);
  }

  /**
   * `sideEffect` runs immediately after the first query matching `match`
   * completes — the deterministic stand-in for a concurrent client that
   * commits in the window between a guard read and the write it protects.
   */
  function interleaveAfter(
    match: (node: RootOperationNode,) => boolean,
    sideEffect: () => void,
  ): KyselyPlugin {
    let armed = false;
    let fired = false;
    return {
      transformQuery: (args,) => {
        if (!fired && match(args.node,)) { armed = true; }
        return args.node;
      },
      transformResult: (args,) => {
        if (armed && !fired) {
          fired = true;
          sideEffect();
        }
        return Promise.resolve(args.result,);
      },
    };
  }

  /** Promote `branchId` to the chat's displayed branch (both active signals). */
  function promoteActive(chatId: string, branchId: string,): void {
    tdb.sqlite.run("UPDATE chats SET active_branch_id = ? WHERE id = ?", [branchId, chatId,],);
    tdb.sqlite.run("UPDATE chat_branches SET is_active = 1 WHERE id = ?", [branchId,],);
  }

  /** Insert a competing `chat_branches` row straight through SQLite. */
  function insertBranch(chatId: string, parentMessageId: string, name: string,): void {
    tdb.sqlite.run(
      "INSERT INTO chat_branches (id, chat_id, parent_message_id, name, is_active) VALUES (?, ?, ?, ?, 0)",
      [randomUUID(), chatId, parentMessageId, name,],
    );
  }

  /** Remove a `chat_branches` row straight through SQLite. */
  function dropBranch(branchId: string,): void {
    tdb.sqlite.run("DELETE FROM chat_branches WHERE id = ?", [branchId,],);
  }

  /** The `chat_branches` names in `chatId`, oldest first. */
  async function branchNames(chatId: string,): Promise<string[]> {
    const rows = await tdb.db
      .selectFrom("chat_branches",)
      .select(["name",],)
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "asc",)
      .execute();
    return rows.map((row,) => row.name);
  }

  test("the (chat_id, name) UNIQUE index rejects two branches sharing one name", async () => {
    const chatId = await newChat("Unique",);
    const rootId = await msg(chatId, "root",);
    await fork(chatId, rootId,);

    let rejected = false;
    try {
      await tdb.db
        .insertInto("chat_branches",)
        .values({
          id: randomUUID(),
          chat_id: chatId,
          parent_message_id: rootId,
          name: "Branch 1",
          is_active: 0,
        },)
        .execute();
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("UNIQUE constraint failed",);
    }
    expect(rejected,).toBe(true,);
  });

  test("the same name is free in a DIFFERENT chat (the index is per-chat)", async () => {
    const chatA = await newChat("NameScope A",);
    const chatB = await newChat("NameScope B",);
    const rootA = await msg(chatA, "root",);
    const rootB = await msg(chatB, "root",);

    const first = ok(await forkBranch(tdb.db, { chatId: chatA, messageId: rootA, actorId: ownerId, name: "Alt", },),);
    const second = ok(await forkBranch(tdb.db, { chatId: chatB, messageId: rootB, actorId: ownerId, name: "Alt", },),);
    expect([first.branch.name, second.branch.name,],).toEqual(["Alt", "Alt",],);
  });

  test("a user-supplied name already taken in the chat is refused, never suffixed", async () => {
    const chatId = await newChat("DupName",);
    const rootId = await msg(chatId, "root",);
    ok(await forkBranch(tdb.db, { chatId, messageId: rootId, actorId: ownerId, name: "Alt", },),);

    failsWith(
      await forkBranch(tdb.db, { chatId, messageId: rootId, actorId: ownerId, name: "  Alt  ", },),
      "bad_request",
    );
    // Neither a silent overwrite nor a silent "Alt (2)".
    expect(await branchNames(chatId,),).toEqual(["Alt",],);
  });

  test("an auto-named fork whose label lost the race lands on a free name", async () => {
    const chatId = await newChat("AutoRace",);
    const rootId = await msg(chatId, "root",);
    // A concurrent fork commits "Branch 1" right after this fork counts the
    // chat's branches — the exact window that used to produce two "Branch 1".
    const raced = tdb.db.withPlugin(
      interleaveAfter(
        (node,) => selectsFrom(node, "chat_branches",),
        () => insertBranch(chatId, rootId, "Branch 1",),
      ),
    );

    const result = ok(await forkBranch(raced, { chatId, messageId: rootId, actorId: ownerId, },),);
    expect(result.branch.name,).not.toBe("Branch 1",);
    const names = await branchNames(chatId,);
    expect(names.length,).toBe(2,);
    expect(new Set(names,).size,).toBe(2,);
  });

  test("an auto-named fork resolves past a gap left by deleted branches", async () => {
    const chatId = await newChat("NameGap",);
    const rootId = await msg(chatId, "root",);
    // Deleting branches leaves the count BELOW the highest label, so
    // `count + 1` can be occupied. Branch 1..5 were deleted; 6..10 remain, so
    // count + 1 === 6 and a candidate that only adds `attempt` walks straight
    // through five occupied labels and gives up on an ordinary fork.
    for (let n = 6; n <= 10; n++) { insertBranch(chatId, rootId, `Branch ${n}`,); }

    const result = ok(await forkBranch(tdb.db, { chatId, messageId: rootId, actorId: ownerId, },),);
    expect(result.branch.name,).toBe("Branch 11",);
    expect(new Set(await branchNames(chatId,),).size,).toBe(6,);
  });

  test("merge refuses a source promoted to active after the guard read, and keeps the row", async () => {
    // root ─┬─ a ─ a1      (source line)
    //       └─ b ─ b1      (target line)
    const chatId = await newChat("MergeRace",);
    const rootId = await msg(chatId, "root",);
    const aId = await msg(chatId, "a", rootId,);
    const a1Id = await msg(chatId, "a1", aId,);
    const bId = await msg(chatId, "b", rootId,);
    const b1Id = await msg(chatId, "b1", bId,);
    const target = await fork(chatId, b1Id,);
    const source = await fork(chatId, aId,);
    ok(await switchActiveBranch(tdb.db, { chatId, branchId: target, actorId: ownerId, },),);

    // The promotion lands right after the guard reads the active pointer — a
    // `PATCH /active-branch` winning the race with the merge.
    const raced = tdb.db.withPlugin(
      interleaveAfter(
        (node,) => selectsFrom(node, "chats",) && selectsActivePointer(node,),
        () => promoteActive(chatId, source,),
      ),
    );

    failsWith(
      await mergeBranch(raced, { chatId, branchId: source, actorId: ownerId, intoBranchId: target, },),
      "bad_request",
    );
    const kept = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", source,)
      .executeTakeFirst();
    expect(kept,).toBeDefined();
    // Nothing was re-parented: the merge never partially happened.
    const targetRow = await tdb.db
      .selectFrom("chat_branches",)
      .select(["parent_message_id",],)
      .where("id", "=", target,)
      .executeTakeFirst();
    expect(targetRow?.parent_message_id,).toBe(b1Id,);
    const a1Row = await tdb.db
      .selectFrom("messages",)
      .select(["parent_id",],)
      .where("id", "=", a1Id,)
      .executeTakeFirst();
    expect(a1Row?.parent_id,).toBe(aId,);
  });

  test("delete refuses a branch promoted to active after the guard read", async () => {
    const chatId = await newChat("DeleteRace",);
    const rootId = await msg(chatId, "root",);
    const stale = await fork(chatId, rootId,);
    await fork(chatId, await msg(chatId, "alt", rootId,),);

    const raced = tdb.db.withPlugin(
      interleaveAfter(
        (node,) => selectsFrom(node, "chats",) && selectsActivePointer(node,),
        () => promoteActive(chatId, stale,),
      ),
    );

    failsWith(await deleteBranch(raced, { chatId, branchId: stale, actorId: ownerId, },), "bad_request",);
    const kept = await tdb.db
      .selectFrom("chat_branches",)
      .select(["id",],)
      .where("id", "=", stale,)
      .executeTakeFirst();
    expect(kept,).toBeDefined();
  });

  test("delete reports not_found when the row disappears before the delete runs", async () => {
    const chatId = await newChat("DeleteVanished",);
    const rootId = await msg(chatId, "root",);
    const stale = await fork(chatId, rootId,);
    await fork(chatId, await msg(chatId, "alt", rootId,),);

    // A concurrent client consumes the row in the guard/delete window. Kysely
    // does not raise on an empty match, so only the affected-row count catches
    // this — without it the caller is told a vanished branch was deleted.
    const raced = tdb.db.withPlugin(
      interleaveAfter(
        (node,) => selectsFrom(node, "chats",) && selectsActivePointer(node,),
        () => dropBranch(stale,),
      ),
    );

    failsWith(await deleteBranch(raced, { chatId, branchId: stale, actorId: ownerId, },), "not_found",);
  });

  test("merge reports not_found when the source vanished before the delete runs", async () => {
    const chatId = await newChat("MergeVanished",);
    const rootId = await msg(chatId, "root",);
    const aId = await msg(chatId, "a", rootId,);
    const bId = await msg(chatId, "b", rootId,);
    const target = await fork(chatId, bId,);
    const source = await fork(chatId, aId,);
    ok(await switchActiveBranch(tdb.db, { chatId, branchId: target, actorId: ownerId, },),);

    const raced = tdb.db.withPlugin(
      interleaveAfter(
        (node,) => selectsFrom(node, "messages",),
        () => dropBranch(source,),
      ),
    );

    failsWith(
      await mergeBranch(raced, { chatId, branchId: source, actorId: ownerId, intoBranchId: target, },),
      "not_found",
    );
    // The re-parenting rolled back with the abort: `a` still hangs off `root`.
    const aRow = await tdb.db
      .selectFrom("messages",)
      .select(["parent_id",],)
      .where("id", "=", aId,)
      .executeTakeFirst();
    expect(aRow?.parent_id,).toBe(rootId,);
  });
});
