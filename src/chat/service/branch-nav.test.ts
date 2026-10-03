/**
 * Tests for branch navigation service (FEAT-046).
 *
 * Covers branch detail, rename/activate, the delete and merge guards,
 * merge re-parenting (including source-row consumption), and keyset
 * pagination. Every test seeds its own chat so the one-active-branch
 * invariant cannot leak between cases.
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
});
