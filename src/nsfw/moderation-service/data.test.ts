/**
 * Tests for nsfw/moderation-service/data.ts — GDPR export + audit-preserving delete.
 *
 * Regression for BUG-nsfw-moderation-delete-destroys-audit-log. The fix
 * soft-deletes `moderation_actions` (sets `deleted_at` + `deleted_by`) so
 * the audit log persists, while still hard-deleting user-owned rows
 * (`nsfw_user_preferences`, reporter's own `content_flags`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { Logger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import {
  insertContentFlags,
  insertModerationActions,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { deleteUserData, exportUserData, } from "./data";
import type { NsfwModerationServiceContext, } from "./types";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

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

function makeCtx(): NsfwModerationServiceContext {
  return {
    db,
    log: makeLog(),
    recordAction: mock(async () => ({}) as never),
    unblockUser: mock(async () => ({}) as never),
    unbanUser: mock(async () => ({}) as never),
    unshadowUser: mock(async () => ({}) as never),
    getPreferences: mock(async () => null),
    getAuditLog: mock(async () => []),
  } as unknown as NsfwModerationServiceContext;
}

const TARGET = "target-user-audit";
const REPORTER = "reporter-flags";
const ADMIN = "admin-deleter";

async function seedUsers(): Promise<void> {
  await insertUsers(db, "target", "Target", { id: TARGET, } as never,);
  await insertUsers(db, "reporter", "Reporter", { id: REPORTER, } as never,);
  await insertUsers(db, "admin", "Admin", { id: ADMIN, } as never,);
}

async function insertPrefs(userId: string,): Promise<void> {
  await db.insertInto("nsfw_user_preferences",)
    .values({
      id: crypto.randomUUID(),
      user_id: userId,
      nsfw_enabled: 1,
      max_rating: "nsfw",
      updated_at: new Date().toISOString(),
    },)
    .execute();
}

async function insertFlag(reporterId: string, contentId: string,): Promise<void> {
  await insertContentFlags(db, reporterId, "message", contentId, "spam",);
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
  await seedUsers();
},);

beforeEach(async () => {
  await resetTestDb(sqlite,);
  await seedUsers();
},);

afterAll(async () => {
  await sqlite.close();
},);

describe("deleteUserData (BUG-nsfw-moderation-delete-destroys-audit-log)", () => {
  test("moderation_actions rows are soft-deleted (preserved with deleted_at), not hard-deleted", async () => {
    const ctx = makeCtx();
    await insertModerationActions(db, "block", TARGET, ADMIN, "harassment", "user",);
    await insertModerationActions(db, "ban", TARGET, ADMIN, "repeat", "user",);
    await insertModerationActions(db, "shadow", TARGET, ADMIN, "spam", "user",);
    await insertModerationActions(db, "warn", "other-user", ADMIN, "noise", "user",);

    await deleteUserData({ thisL: ctx, userId: TARGET, deletedBy: ADMIN, },);

    const remaining = await db.selectFrom("moderation_actions",)
      .select("id",)
      .where("target_user_id", "in", [TARGET, "other-user",],)
      .execute();
    expect(remaining.length,).toBe(4,);

    const deleted = await db.selectFrom("moderation_actions",)
      .select(["target_user_id", "deleted_at", "deleted_by",],)
      .where("target_user_id", "=", TARGET,)
      .execute();
    expect(deleted.length,).toBe(3,);
    for (const row of deleted) {
      expect(row.deleted_at,).not.toBeNull();
      expect(row.deleted_by,).toBe(ADMIN,);
    }
    const other = await db.selectFrom("moderation_actions",)
      .select("deleted_at",)
      .where("target_user_id", "=", "other-user",)
      .executeTakeFirst();
    expect(other?.deleted_at,).toBeNull();
  });

  test("nsfw_user_preferences for target is hard-deleted (user-owned row)", async () => {
    const ctx = makeCtx();
    await insertPrefs(TARGET,);

    await deleteUserData({ thisL: ctx, userId: TARGET, deletedBy: ADMIN, },);

    const prefs = await db.selectFrom("nsfw_user_preferences",)
      .select("user_id",)
      .where("user_id", "=", TARGET,)
      .execute();
    expect(prefs.length,).toBe(0,);
  });

  test("reporter's own content_flags are hard-deleted; other reporters' flags remain", async () => {
    const ctx = makeCtx();
    await insertFlag(REPORTER, "msg-1",);
    await insertFlag(REPORTER, "msg-2",);
    await insertFlag("other-reporter", "msg-3",);

    await deleteUserData({ thisL: ctx, userId: REPORTER, deletedBy: ADMIN, },);

    const remaining = await db.selectFrom("content_flags",)
      .select("reporter_id",)
      .where("reporter_id", "in", [REPORTER, "other-reporter",],)
      .execute();
    expect(remaining.length,).toBe(1,);
    expect(remaining[0]?.reporter_id,).toBe("other-reporter",);
  });

  test("a log_entries audit row is written recording the destructive operation", async () => {
    const ctx = makeCtx();
    await insertModerationActions(db, "block", TARGET, ADMIN, "test", "user",);

    await deleteUserData({ thisL: ctx, userId: TARGET, deletedBy: ADMIN, },);

    const audit = await db.selectFrom("log_entries",)
      .select(["module", "action", "user_id", "entity_id",],)
      .where("module", "=", "nsfw-moderation",)
      .where("action", "=", "delete-user-data",)
      .execute();
    expect(audit.length,).toBe(1,);
    expect(audit[0]?.user_id,).toBe(ADMIN,);
    expect(audit[0]?.entity_id,).toBe(TARGET,);
  });

  test("re-running on the same target leaves deleted_at unchanged (no overwrite)", async () => {
    const ctx = makeCtx();
    await insertModerationActions(db, "block", TARGET, ADMIN, "test", "user",);

    await deleteUserData({ thisL: ctx, userId: TARGET, deletedBy: ADMIN, },);
    const first = await db.selectFrom("moderation_actions",)
      .select("deleted_at",)
      .where("target_user_id", "=", TARGET,)
      .executeTakeFirst();
    const firstAt = first?.deleted_at;
    expect(firstAt,).not.toBeNull();

    // Re-run synchronously: must not overwrite deleted_at (preserves provenance).
    await deleteUserData({ thisL: ctx, userId: TARGET, deletedBy: ADMIN, },);
    const second = await db.selectFrom("moderation_actions",)
      .select("deleted_at",)
      .where("target_user_id", "=", TARGET,)
      .executeTakeFirst();
    expect(second?.deleted_at,).toBe(firstAt,);
  });
});

describe("exportUserData", () => {
  test("excludes soft-deleted moderation_actions; prefs call is fulfilled (real DB row present)", async () => {
    const ctx = makeCtx();
    await insertModerationActions(db, "block", TARGET, ADMIN, "test", "user",);
    await insertPrefs(TARGET,);

    // Wipe the audit row to verify exportUserData filters by deleted_at IS NULL.
    await deleteUserData({ thisL: ctx, userId: TARGET, deletedBy: ADMIN, },);

    // Re-seed prefs (deleteUserData hard-deleted them) so export has data.
    await insertPrefs(TARGET,);

    // Use a context whose getPreferences hits the real DB so prefs are populated.
    const realCtx: NsfwModerationServiceContext = {
      ...ctx,
      getPreferences: async (uid: string,) => {
        const row = await db.selectFrom("nsfw_user_preferences",)
          .selectAll()
          .where("user_id", "=", uid,)
          .executeTakeFirst();
        return row ? ({ ...row, } as never) : null;
      },
    };
    const exported = await exportUserData({ thisL: realCtx, userId: TARGET, exportedBy: ADMIN, },);

    // Soft-deleted audit row excluded from the export bundle.
    expect(exported.actions.length,).toBe(0,);
    expect(exported.preferences,).not.toBeNull();
  });

  // BUG-nsfw-export-bundle-no-access-log
  test("emits a log_entries access-log row BEFORE serving the bundle", async () => {
    const ctx = makeCtx();
    await insertPrefs(TARGET,);
    const logCountBefore = await db.selectFrom("log_entries",).selectAll()
      .where("entity_id", "=", TARGET,)
      .where("action", "=", "export-user-data",)
      .execute()
      .then((rows,) => rows.length);
    await exportUserData({ thisL: ctx, userId: TARGET, exportedBy: ADMIN, clientIp: "10.0.0.1", },);
    const logCountAfter = await db.selectFrom("log_entries",).selectAll()
      .where("entity_id", "=", TARGET,)
      .where("action", "=", "export-user-data",)
      .execute()
      .then((rows,) => rows.length);
    expect(logCountAfter,).toBe(logCountBefore + 1,);
    const row = await db.selectFrom("log_entries",).selectAll()
      .where("entity_id", "=", TARGET,)
      .where("action", "=", "export-user-data",)
      .orderBy("created_at", "desc",)
      .limit(1,)
      .executeTakeFirst();
    expect(row?.user_id,).toBe(ADMIN,);
    expect(row?.module,).toBe("nsfw-moderation",);
    expect(row?.meta,).toContain("10.0.0.1",);
  });

  test("free-text fields (`reason`, `description`) are length-capped to a preview in the bundle", async () => {
    const ctx = makeCtx();
    const longReason = "X".repeat(500,);
    const longDescription = "Y".repeat(500,);
    // Seed a block action with a long reason.
    await insertModerationActions(db, "block", TARGET, ADMIN, longReason, "user",);
    // Seed a flag with a long description.
    await db.insertInto("content_flags",).values({
      id: `flag-${TARGET}`,
      reporter_id: TARGET,
      content_type: "message",
      content_id: "m-1",
      chat_id: null,
      world_id: null,
      flag_reason: "spam",
      description: longDescription,
      status: "pending",
      resolution: null,
      resolved_by: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
    },).execute();
    const realCtx: NsfwModerationServiceContext = {
      ...ctx,
      getPreferences: async (uid: string,) => {
        const row = await db.selectFrom("nsfw_user_preferences",).selectAll()
          .where("user_id", "=", uid,).executeTakeFirst();
        return row ? ({ ...row, } as never) : null;
      },
      getAuditLog: async (uid: string,) => {
        const rows = await db.selectFrom("moderation_actions",).selectAll()
          .where("target_user_id", "=", uid,)
          .where("deleted_at", "is", null,)
          .execute();
        return rows as never;
      },
    };
    const exported = await exportUserData({ thisL: realCtx, userId: TARGET, exportedBy: ADMIN, },);
    expect(exported.actions.length,).toBeGreaterThan(0,);
    for (const action of exported.actions) {
      expect(action.reason.length,).toBeLessThanOrEqual(201,);
      expect(action.reason.endsWith("…",),).toBe(true,);
    }
    expect(exported.flags.length,).toBeGreaterThan(0,);
    for (const flag of exported.flags) {
      const desc = (flag as { description?: string }).description ?? "";
      expect(desc.length,).toBeLessThanOrEqual(201,);
      expect(desc.endsWith("…",),).toBe(true,);
    }
  });
});
