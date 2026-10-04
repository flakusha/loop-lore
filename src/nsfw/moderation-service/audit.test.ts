// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/nsfw/moderation-service/audit.ts — recordAction, getAuditLog,
 * notifyUser, and mapAction.
 *
 * Edge classes: system actions skip notification, soft-deleted rows excluded,
 * limit/offset pagination, unknown action type fallback text, metadata parsing.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { getAuditLog, mapAction, notifyUser, recordAction, } from "./audit";
import { NsfwModerationService, } from "./index";

let db: Kysely<DB>;
let svc: NsfwModerationService;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
  svc = new NsfwModerationService(db,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("audit — recordAction", () => {
  test("records action and returns ModAction", async () => {
    const action = await recordAction({
      thisL: { db, log: svc["log"], } as any,
      params: {
        actionType: "block",
        targetUserId: "audit-target-1",
        performedBy: "mod-1",
        reason: "spam",
        scope: "chat",
        scopeId: "chat-1",
      },
    },);

    expect(action.actionType,).toBe("block",);
    expect(action.targetUserId,).toBe("audit-target-1",);
    expect(action.performedBy,).toBe("mod-1",);
    expect(action.reason,).toBe("spam",);
    expect(action.scope,).toBe("chat",);
    expect(action.scopeId,).toBe("chat-1",);
    expect(action.metadata,).toEqual({},);
    expect(action.expiresAt,).toBeNull();
    expect(action.deletedAt,).toBeNull();
    expect(action.deletedBy,).toBeNull();
    expect(action.id,).toBeDefined();
    expect(action.createdAt,).toBeDefined();
  });

  test("system action skips notification", async () => {
    const action = await recordAction({
      thisL: { db, log: svc["log"], } as any,
      params: {
        actionType: "ban",
        targetUserId: "audit-target-2",
        performedBy: "system",
        reason: "auto",
        scope: "world",
        scopeId: "world-1",
      },
    },);

    expect(action.performedBy,).toBe("system",);
    // No notification row should exist for system actions.
    const notif = await db
      .selectFrom("notifications",)
      .select("id",)
      .where("user_id", "=", "audit-target-2",)
      .executeTakeFirst();

    expect(notif,).toBeUndefined();
  });

  test("non-system action creates notification", async () => {
    await insertUsers(db, "audit-target-3", "Audit Target 3", {
      id: "audit-target-3" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    await recordAction({
      thisL: { db, log: svc["log"], } as any,
      params: {
        actionType: "block",
        targetUserId: "audit-target-3",
        performedBy: "mod-2",
        reason: "spam",
        scope: "chat",
        scopeId: "chat-2",
      },
    },);

    const notif = await db
      .selectFrom("notifications",)
      .select(["title", "body", "type",],)
      .where("user_id", "=", "audit-target-3",)
      .executeTakeFirst();

    expect(notif?.type,).toBe("moderation",);
    expect(notif?.title,).toBe("You have been blocked from NSFW content",);
    expect(notif?.body,).toBe("You can no longer interact with NSFW content.",);
  });
});

describe("audit — getAuditLog", () => {
  test("returns actions newest first", async () => {
    const targetId = "audit-log-target-1";
    // Insert directly with staggered timestamps (recordAction uses
    // new Date().toISOString() which may collide within the same millisecond).
    const types = ["block", "unblock", "ban",];
    for (let i = 0; i < types.length; i++) {
      await db.insertInto("moderation_actions",).values({
        id: `audit-order-${i}`,
        action_type: types[i]!,
        target_user_id: targetId,
        performed_by: "system",
        reason: "test",
        scope: "chat",
        scope_id: "chat-x",
        metadata: "{}",
        created_at: `2026-01-01T00:00:0${i + 1}Z`,
      } as never,).execute();
    }

    const log = await getAuditLog({
      thisL: { db, log: svc["log"], } as any,
      targetUserId: targetId,
    },);

    expect(log,).toHaveLength(3,);
    // Newest first: ban, unblock, block.
    expect(log[0]!.actionType,).toBe("ban",);
    expect(log[1]!.actionType,).toBe("unblock",);
    expect(log[2]!.actionType,).toBe("block",);
  });

  test("excludes soft-deleted rows", async () => {
    const targetId = "audit-log-target-2";
    const action = await recordAction({
      thisL: { db, log: svc["log"], } as any,
      params: {
        actionType: "block",
        targetUserId: targetId,
        performedBy: "system",
        reason: "test",
        scope: "chat",
        scopeId: "chat-y",
      },
    },);

    // Soft-delete the row.
    await db
      .updateTable("moderation_actions",)
      .set({ deleted_at: new Date().toISOString(), deleted_by: "mod-1", },)
      .where("id", "=", action.id,)
      .execute();

    const log = await getAuditLog({
      thisL: { db, log: svc["log"], } as any,
      targetUserId: targetId,
    },);

    expect(log,).toHaveLength(0,);
  });

  test("respects limit option", async () => {
    const targetId = "audit-log-target-3";
    for (const type of ["block", "unblock", "ban",]) {
      await recordAction({
        thisL: { db, log: svc["log"], } as any,
        params: {
          actionType: type,
          targetUserId: targetId,
          performedBy: "system",
          reason: "test",
          scope: "chat",
          scopeId: "chat-z",
        },
      },);
    }

    const log = await getAuditLog({
      thisL: { db, log: svc["log"], } as any,
      targetUserId: targetId,
      options: { limit: 2, },
    },);

    expect(log,).toHaveLength(2,);
  });

  test("respects offset option", async () => {
    const targetId = "audit-log-target-4";
    const types = ["block", "unblock", "ban",];
    for (const type of types) {
      await recordAction({
        thisL: { db, log: svc["log"], } as any,
        params: {
          actionType: type,
          targetUserId: targetId,
          performedBy: "system",
          reason: "test",
          scope: "chat",
          scopeId: "chat-w",
        },
      },);
    }

    // recordAction stamps created_at with millisecond precision, so three
    // back-to-back inserts can share a timestamp and `orderBy created_at desc`
    // leaves their relative order to the storage engine. Pin distinct stamps so
    // the offset window is deterministic: desc order is ban, unblock, block.
    for (const [i, type,] of types.entries()) {
      await db.updateTable("moderation_actions",)
        .set({ created_at: `2026-01-01T00:00:0${i + 1}Z`, },)
        .where("target_user_id", "=", targetId,)
        .where("action_type", "=", type,)
        .execute();
    }

    const log = await getAuditLog({
      thisL: { db, log: svc["log"], } as any,
      targetUserId: targetId,
      options: { limit: 1, offset: 1, },
    },);

    expect(log,).toHaveLength(1,);
    expect(log[0]!.actionType,).toBe("unblock",);
  });

  test("returns empty array for unknown user", async () => {
    const log = await getAuditLog({
      thisL: { db, log: svc["log"], } as any,
      targetUserId: "no-such-user",
    },);

    expect(log,).toEqual([],);
  });
});

describe("audit — notifyUser", () => {
  test("known action type uses canned title and body", async () => {
    await insertUsers(db, "notify-target-1", "Notify Target 1", {
      id: "notify-target-1" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    await notifyUser(
      { db, log: svc["log"], } as any,
      "notify-target-1",
      "shadow",
    );

    const notif = await db
      .selectFrom("notifications",)
      .select(["title", "body",],)
      .where("user_id", "=", "notify-target-1",)
      .executeTakeFirst();

    expect(notif?.title,).toBe("Your NSFW access has been restricted",);
    expect(notif?.body,).toBe("Some of your NSFW interactions have been limited.",);
  });

  test("unknown action type uses fallback text", async () => {
    await insertUsers(db, "notify-target-2", "Notify Target 2", {
      id: "notify-target-2" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    await notifyUser(
      { db, log: svc["log"], } as any,
      "notify-target-2",
      "custom_action",
    );

    const notif = await db
      .selectFrom("notifications",)
      .select(["title", "body",],)
      .where("user_id", "=", "notify-target-2",)
      .executeTakeFirst();

    expect(notif?.title,).toBe("Moderation action: custom_action",);
    expect(notif?.body,).toBe("A moderation action was applied to your account: custom_action.",);
  });
});

describe("audit — mapAction", () => {
  test("maps snake_case row to camelCase ModAction", () => {
    const row = {
      id: "row-1",
      action_type: "block",
      target_user_id: "user-1",
      performed_by: "mod-1",
      reason: "spam",
      scope: "chat",
      scope_id: "chat-1",
      metadata: '{"key":"value"}',
      expires_at: null,
      created_at: "2026-01-01T00:00:00Z",
      deleted_at: null,
      deleted_by: null,
    };

    const action = mapAction(row,);
    expect(action.id,).toBe("row-1",);
    expect(action.actionType,).toBe("block",);
    expect(action.targetUserId,).toBe("user-1",);
    expect(action.performedBy,).toBe("mod-1",);
    expect(action.reason,).toBe("spam",);
    expect(action.scope,).toBe("chat",);
    expect(action.scopeId,).toBe("chat-1",);
    expect(action.metadata,).toEqual({ key: "value", },);
    expect(action.expiresAt,).toBeNull();
    expect(action.createdAt,).toBe("2026-01-01T00:00:00Z",);
    expect(action.deletedAt,).toBeNull();
    expect(action.deletedBy,).toBeNull();
  });

  test("handles missing deleted_at/deleted_by", () => {
    const row = {
      id: "row-2",
      action_type: "ban",
      target_user_id: "user-2",
      performed_by: "system",
      reason: "auto",
      scope: "world",
      scope_id: null,
      metadata: "{}",
      expires_at: "2027-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    };

    const action = mapAction(row,);
    expect(action.deletedAt,).toBeNull();
    expect(action.deletedBy,).toBeNull();
    expect(action.scopeId,).toBeNull();
    expect(action.expiresAt,).toBe("2027-01-01T00:00:00Z",);
  });

  test("parses invalid metadata as empty object", () => {
    const row = {
      id: "row-3",
      action_type: "block",
      target_user_id: "user-3",
      performed_by: "mod-1",
      reason: "spam",
      scope: "chat",
      scope_id: "chat-1",
      metadata: "not-json",
      expires_at: null,
      created_at: "2026-01-01T00:00:00Z",
    };

    const action = mapAction(row,);
    expect(action.metadata,).toEqual({},);
  });
});
