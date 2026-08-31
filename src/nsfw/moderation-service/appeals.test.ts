/**
 * Tests for nsfw/moderation-service/appeals.ts — moderation appeals
 *
 * Verifies appeal submission, listing, pending queue, and review with
 * automatic reversal of the original moderation action.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { Logger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import {
  getPendingAppeals,
  getUserAppeals,
  reviewAppeal,
  submitAppeal,
} from "./appeals";
import { executeReversal, } from "./appeals-reversal";
import type { ModAction, NsfwModerationServiceContext, } from "./types";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

/** */
function makeLog(): Logger {
  return {
    trace: mock(() => {},),
    debug: mock(() => {},),
    info: mock(() => {},),
    warn: mock(() => {},),
    error: mock(() => {},),
    fatal: mock(() => {},),
    child: mock(() => makeLog()),
  } as unknown as Logger;
}

/**
 * Build a context with spied reversal methods for approval tests.
 * @param overrides
 * @param overrides.unblockUser
 * @param overrides.unbanUser
 * @param overrides.unshadowUser
 */
function makeCtx(overrides?: {
  unblockUser?: ReturnType<typeof mock>;
  unbanUser?: ReturnType<typeof mock>;
  unshadowUser?: ReturnType<typeof mock>;
},): NsfwModerationServiceContext {
  const recordAction = mock(async (params: Parameters<NsfwModerationServiceContext["recordAction"]>[0],) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insertInto("moderation_actions",).values({
      id,
      action_type: params.actionType,
      target_user_id: params.targetUserId,
      performed_by: params.performedBy,
      reason: params.reason,
      scope: params.scope,
      scope_id: params.scopeId,
      metadata: "{}",
      expires_at: null,
      created_at: now,
      superseded_by: null,
      deleted_at: null,
      deleted_by: null,
    },).execute();
    return {
      id,
      actionType: params.actionType,
      targetUserId: params.targetUserId,
      performedBy: params.performedBy,
      reason: params.reason,
      scope: params.scope,
      scopeId: params.scopeId,
      metadata: {},
      expiresAt: null,
      createdAt: now,
    } as ModAction;
  },);
  return {
    db,
    log: makeLog(),
    recordAction,
    unblockUser: overrides?.unblockUser ?? mock(() => Promise.resolve({} as ModAction,)),
    unbanUser: overrides?.unbanUser ?? mock(() => Promise.resolve({} as ModAction,)),
    unshadowUser: overrides?.unshadowUser ?? mock(() => Promise.resolve({} as ModAction,)),
  } as unknown as NsfwModerationServiceContext;
}

const USER = "user-appealing-1";

/**
 * @param params
 * @param params.id
 * @param params.actionType
 * @param params.targetUserId
 */
async function insertActionRow(params: {
  id: string;
  actionType: string;
  targetUserId: string;
},): Promise<void> {
  await db.insertInto("moderation_actions",).values({
    id: params.id,
    action_type: params.actionType,
    target_user_id: params.targetUserId,
    performed_by: "admin-1",
    reason: "test action",
    scope: "user",
    scope_id: null,
    metadata: "{}",
    expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },).execute();
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  db.destroy();
},);

describe("submitAppeal", () => {
  test("creates a pending appeal and returns id + status", async () => {
    await insertActionRow({ id: "action-1", actionType: "block", targetUserId: USER, },);
    const result = await submitAppeal({
      thisL: makeCtx(),
      userId: USER,
      actionId: "action-1",
      reason: "I did not break the rules",
    },);
    expect(result.status,).toBe("pending",);
    expect(result.id,).toBeTruthy();

    const row = await db.selectFrom("moderation_appeals",).selectAll()
      .where("id", "=", result.id,).executeTakeFirst();
    expect(row?.status,).toBe("pending",);
    expect(row?.user_id,).toBe(USER,);
    expect(row?.action_id,).toBe("action-1",);
  });
});

describe("getUserAppeals", () => {
  test("lists a user's appeals with mapped fields", async () => {
    await insertActionRow({ id: "action-a1", actionType: "block", targetUserId: USER, },);
    await insertActionRow({ id: "action-a2", actionType: "ban", targetUserId: USER, },);
    await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-a1", reason: "first", },);
    await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-a2", reason: "second", },);

    const appeals = await getUserAppeals({ thisL: makeCtx(), userId: USER, },);
    expect(appeals,).toHaveLength(2,);
    expect(appeals.map((a,) => a.actionId),).toEqual(expect.arrayContaining(["action-a1", "action-a2",],),);
    expect(appeals.every((a,) => a.status === "pending"),).toBe(true,);
    expect(appeals.every((a,) => a.reviewedBy === null),).toBe(true,);
  });

  test("orders a user's appeals newest-first by created_at", async () => {
    await insertActionRow({ id: "action-a3", actionType: "block", targetUserId: USER, },);
    await insertActionRow({ id: "action-a4", actionType: "block", targetUserId: USER, },);
    await db.insertInto("moderation_appeals",).values([
      {
        id: "appeal-old",
        user_id: USER,
        action_id: "action-a3",
        reason: "old",
        status: "pending",
        reviewed_by: null,
        review_note: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: null,
      },
      {
        id: "appeal-new",
        user_id: USER,
        action_id: "action-a4",
        reason: "new",
        status: "pending",
        reviewed_by: null,
        review_note: null,
        created_at: "2026-02-01T00:00:00.000Z",
        updated_at: null,
      },
    ],).execute();

    const appeals = await getUserAppeals({ thisL: makeCtx(), userId: USER, },);
    expect(appeals.map((a,) => a.id),).toEqual(["appeal-new", "appeal-old",],);
  });

  test("does not return other users' appeals", async () => {
    await insertActionRow({ id: "action-b1", actionType: "block", targetUserId: "other-user", },);
    await submitAppeal({ thisL: makeCtx(), userId: "other-user", actionId: "action-b1", reason: "x", },);
    const appeals = await getUserAppeals({ thisL: makeCtx(), userId: USER, },);
    expect(appeals,).toHaveLength(0,);
  });
});

describe("getPendingAppeals", () => {
  test("returns pending appeals oldest-first and respects limit", async () => {
    await insertActionRow({ id: "action-c1", actionType: "block", targetUserId: USER, },);
    await insertActionRow({ id: "action-c2", actionType: "block", targetUserId: USER, },);
    await insertActionRow({ id: "action-c3", actionType: "block", targetUserId: USER, },);
    await db.insertInto("moderation_appeals",).values([
      {
        id: "appeal-c1",
        user_id: USER,
        action_id: "action-c1",
        reason: "one",
        status: "pending",
        reviewed_by: null,
        review_note: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: null,
      },
      {
        id: "appeal-c2",
        user_id: USER,
        action_id: "action-c2",
        reason: "two",
        status: "pending",
        reviewed_by: null,
        review_note: null,
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: null,
      },
      {
        id: "appeal-c3",
        user_id: USER,
        action_id: "action-c3",
        reason: "three",
        status: "pending",
        reviewed_by: null,
        review_note: null,
        created_at: "2026-01-03T00:00:00.000Z",
        updated_at: null,
      },
    ],).execute();

    const pending = await getPendingAppeals({ thisL: makeCtx(), limit: 2, },);
    expect(pending,).toHaveLength(2,);
    expect(pending[0]!.actionId,).toBe("action-c1",);
    expect(pending[1]!.actionId,).toBe("action-c2",);
  });
});

describe("reviewAppeal", () => {
  test("denies an appeal without reversing the action", async () => {
    await insertActionRow({ id: "action-d1", actionType: "block", targetUserId: USER, },);
    const unblock = mock(() => Promise.resolve({} as ModAction,));
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-d1", reason: "x", },);

    await reviewAppeal({
      thisL: makeCtx({ unblockUser: unblock, },),
      appealId: appeal.id,
      reviewedBy: "admin-2",
      status: "denied",
      reviewNote: "evidence confirms violation",
    },);

    expect(unblock,).not.toHaveBeenCalled();
    const row = await db.selectFrom("moderation_appeals",).selectAll()
      .where("id", "=", appeal.id,).executeTakeFirst();
    expect(row?.status,).toBe("denied",);
    expect(row?.reviewed_by,).toBe("admin-2",);
    expect(row?.review_note,).toBe("evidence confirms violation",);
    expect(row?.updated_at,).toBeTruthy();
  });

  test("approving a block appeal records pending_reversal without calling unblockUser", async () => {
    await insertActionRow({ id: "action-d2", actionType: "block", targetUserId: USER, },);
    const unblock = mock(() => Promise.resolve({} as ModAction,));
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-d2", reason: "x", },);

    await reviewAppeal({
      thisL: makeCtx({ unblockUser: unblock, },),
      appealId: appeal.id,
      reviewedBy: "admin-2",
      status: "approved",
      reviewNote: "appeal granted",
    },);

    // Approval MUST NOT call unblockUser; reversal is deferred to executeReversal.
    expect(unblock,).not.toHaveBeenCalled();
    const appealRow = await db.selectFrom("moderation_appeals",).selectAll()
      .where("id", "=", appeal.id,).executeTakeFirst();
    expect(appealRow?.status,).toBe("pending_reversal",);
    const actionRow = await db.selectFrom("moderation_actions",)
      .select(["id", "superseded_by",],)
      .where("id", "=", "action-d2",)
      .executeTakeFirst() as unknown as { superseded_by: string | null } | undefined;
    expect(actionRow?.superseded_by,).toBe(appeal.id,);
  });

  test("approving a ban appeal records pending_reversal and supersedes the action", async () => {
    await insertActionRow({ id: "action-d3", actionType: "ban", targetUserId: USER, },);
    const unban = mock(() => Promise.resolve({} as ModAction,));
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-d3", reason: "x", },);

    await reviewAppeal({
      thisL: makeCtx({ unbanUser: unban, },),
      appealId: appeal.id,
      reviewedBy: "admin-2",
      status: "approved",
      reviewNote: "appeal granted",
    },);

    expect(unban,).not.toHaveBeenCalled();
    const appealRow = await db.selectFrom("moderation_appeals",).selectAll()
      .where("id", "=", appeal.id,).executeTakeFirst();
    expect(appealRow?.status,).toBe("pending_reversal",);
    const actionRow = await db.selectFrom("moderation_actions",)
      .select(["id", "superseded_by",],)
      .where("id", "=", "action-d3",)
      .executeTakeFirst() as unknown as { superseded_by: string | null } | undefined;
    expect(actionRow?.superseded_by,).toBe(appeal.id,);
  });

  test("approving a shadow appeal records pending_reversal and supersedes the action", async () => {
    await insertActionRow({ id: "action-d4", actionType: "shadow", targetUserId: USER, },);
    const unshadow = mock(() => Promise.resolve({} as ModAction,));
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-d4", reason: "x", },);

    await reviewAppeal({
      thisL: makeCtx({ unshadowUser: unshadow, },),
      appealId: appeal.id,
      reviewedBy: "admin-2",
      status: "approved",
      reviewNote: "appeal granted",
    },);

    const actionRow = await db.selectFrom("moderation_actions",)
      .select(["id", "superseded_by",],)
      .executeTakeFirst() as unknown as { superseded_by: string | null } | undefined;
    expect(actionRow?.superseded_by,).toBe(appeal.id,);
  });

  test("approving an appeal for an unknown action type still records pending_reversal", async () => {
    await insertActionRow({ id: "action-d5", actionType: "mystery", targetUserId: USER, },);
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-d5", reason: "x", },);

    await expect(reviewAppeal({
      thisL: makeCtx(),
      appealId: appeal.id,
      reviewedBy: "admin-2",
      status: "approved",
      reviewNote: "ok",
    },),).resolves.toBeUndefined();
    const row = await db.selectFrom("moderation_appeals",).selectAll()
      .where("id", "=", appeal.id,).executeTakeFirst();
    expect(row?.status,).toBe("pending_reversal",);
  });

  test("approving an appeal with a missing action does not throw", async () => {
    await insertActionRow({ id: "action-d6", actionType: "block", targetUserId: USER, },);
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-d6", reason: "x", },);
    // Orphan the appeal by removing its action
    await db.deleteFrom("moderation_actions",).where("id", "=", "action-d6",).execute();

    await expect(reviewAppeal({
      thisL: makeCtx(),
      appealId: appeal.id,
      reviewedBy: "admin-2",
      status: "approved",
      reviewNote: "ok",
    },),).resolves.toBeUndefined();
  });
});

describe("executeReversal", () => {
  test("throws when caller is the same as the approver (single-admin guard)", async () => {
    await insertActionRow({ id: "action-r1", actionType: "block", targetUserId: USER, },);
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-r1", reason: "x", },);
    await reviewAppeal({
      thisL: makeCtx(),
      appealId: appeal.id,
      reviewedBy: "admin-1",
      status: "approved",
      reviewNote: "ok",
    },);
    await expect(executeReversal({
      thisL: makeCtx(),
      appealId: appeal.id,
      executedBy: "admin-1",
      approvedBy: "admin-1",
    },),).rejects.toThrow(/a second admin is required/,);
  });

  test("throws when the appeal is not in pending_reversal", async () => {
    await insertActionRow({ id: "action-r2", actionType: "block", targetUserId: USER, },);
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-r2", reason: "x", },);
    await reviewAppeal({
      thisL: makeCtx(),
      appealId: appeal.id,
      reviewedBy: "admin-1",
      status: "denied",
      reviewNote: "no",
    },);
    await expect(executeReversal({
      thisL: makeCtx(),
      appealId: appeal.id,
      executedBy: "admin-2",
      approvedBy: "admin-1",
    },),).rejects.toThrow(/expected "pending_reversal"/,);
  });

  test("two-admin reversal calls unblockUser and moves the appeal to reversed", async () => {
    await insertActionRow({ id: "action-r3", actionType: "block", targetUserId: USER, },);
    const unblock = mock(() =>
      Promise.resolve({
        id: "rev-r3",
        actionType: "unblock",
        targetUserId: USER,
        performedBy: "admin-2",
        reason: "x",
        scope: "nsfw",
        scopeId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        metadata: "{}",
      } as unknown as ModAction,)
    );
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-r3", reason: "x", },);
    await reviewAppeal({
      thisL: makeCtx(),
      appealId: appeal.id,
      reviewedBy: "admin-1",
      status: "approved",
      reviewNote: "ok",
    },);
    await executeReversal({
      thisL: makeCtx({ unblockUser: unblock, },),
      appealId: appeal.id,
      executedBy: "admin-2",
      approvedBy: "admin-1",
    },);

    expect(unblock,).toHaveBeenCalledTimes(1,);
    const row = await db.selectFrom("moderation_appeals",).selectAll()
      .where("id", "=", appeal.id,).executeTakeFirst();
    expect(row?.status,).toBe("reversed",);
  });

  test("reversal writes a notifications row for the original moderator", async () => {
    // The notifications.user_id has a FK to users.id; create the moderator first.
    await db.insertInto("users",).values({
      id: "moderator-A",
      username: "moderator-A",
      display_name: "Moderator A",
      password_hash: null,
      role: "admin",
      status: "active",
      settings: "{}",
      format_version: 0,
      created_at: "2026-01-01T00:00:00.000Z",
    },).execute();
    await db.insertInto("moderation_actions",).values({
      id: "action-r4",
      action_type: "block",
      target_user_id: USER,
      performed_by: "moderator-A",
      reason: "x",
      scope: "nsfw",
      scope_id: null,
      metadata: "{}",
      created_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
      deleted_by: null,
      superseded_by: null,
    },).execute();
    const unblock = mock(() =>
      Promise.resolve({
        id: "rev-r4",
        actionType: "unblock",
        targetUserId: USER,
        performedBy: "admin-2",
        reason: "x",
        scope: "nsfw",
        scopeId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        metadata: "{}",
      } as unknown as ModAction,)
    );
    const appeal = await submitAppeal({ thisL: makeCtx(), userId: USER, actionId: "action-r4", reason: "x", },);
    await reviewAppeal({
      thisL: makeCtx(),
      appealId: appeal.id,
      reviewedBy: "admin-1",
      status: "approved",
      reviewNote: "ok",
    },);
    await executeReversal({
      thisL: makeCtx({ unblockUser: unblock, },),
      appealId: appeal.id,
      executedBy: "admin-2",
      approvedBy: "admin-1",
    },);
    const note = await db.selectFrom("notifications",).selectAll()
      .where("user_id", "=", "moderator-A",).executeTakeFirst();
    expect(note?.type,).toBe("appeal.reversed",);
  });
});
