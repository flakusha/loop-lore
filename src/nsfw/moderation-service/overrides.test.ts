// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration tests for src/nsfw/moderation-service/overrides.ts — the
 * service-level guard on NSFW override setters (TASK-nsfw-override-authz-
 * scope-route-lacks-chat-membership-check): unknown chat/world fail fast,
 * successful changes are attributed and audited.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { NsfwModerationService, } from "./index";

describe("NSFW override service-level guard", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("setChatNsfwOverride throws for unknown chat", async () => {
    const svc = new NsfwModerationService(db,);
    expect(
      svc.setChatNsfwOverride("chat-missing", "enabled", "mod-1",),
    ).rejects.toThrow("chat_not_found:chat-missing");
  });

  test("setChatNsfwOverride updates chat and writes attributed audit row", async () => {
    await insertUsers(db, "mod-1", "Mod One", { id: "mod-1" as never, },);
    await insertChats(db, "override-chat", "mod-1", { id: "chat-override" as never, },);
    const svc = new NsfwModerationService(db,);

    await svc.setChatNsfwOverride("chat-override", "disabled", "mod-1",);

    const chat = await db
      .selectFrom("chats",)
      .select("nsfw_override",)
      .where("id", "=", "chat-override",)
      .executeTakeFirst();
    expect(chat?.nsfw_override,).toBe("disabled",);

    const audit = await db
      .selectFrom("moderation_actions",)
      .selectAll()
      .where("scope_id", "=", "chat-override",)
      .execute();
    expect(audit,).toHaveLength(1,);
    expect(audit[0]!.action_type,).toBe("nsfw_override_set",);
    expect(audit[0]!.performed_by,).toBe("mod-1",);
    expect(audit[0]!.scope,).toBe("chat",);
  });

  test("setWorldNsfwOverride throws for unknown world", async () => {
    const svc = new NsfwModerationService(db,);
    expect(
      svc.setWorldNsfwOverride("world-missing", "disabled", "mod-1",),
    ).rejects.toThrow("world_not_found:world-missing");
  });

  test("setWorldNsfwOverride updates world and writes attributed audit row", async () => {
    await insertWorlds(db, "mod-1", "override-world", { id: "world-override" as never, },);
    const svc = new NsfwModerationService(db,);

    await svc.setWorldNsfwOverride("world-override", "enabled", "mod-1",);

    const world = await db
      .selectFrom("worlds",)
      .select("nsfw_override",)
      .where("id", "=", "world-override",)
      .executeTakeFirst();
    expect(world?.nsfw_override,).toBe("enabled",);

    const audit = await db
      .selectFrom("moderation_actions",)
      .selectAll()
      .where("scope_id", "=", "world-override",)
      .execute();
    expect(audit,).toHaveLength(1,);
    expect(audit[0]!.action_type,).toBe("nsfw_override_set",);
    expect(audit[0]!.performed_by,).toBe("mod-1",);
    expect(audit[0]!.scope,).toBe("world",);
  });
});
