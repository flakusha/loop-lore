// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct tests for `insertGeneratedEntity` — the per-kind insert switch and
 * the location → auto-created public chat binding. The HTTP surface is covered
 * by `src/routes/messages/create-entity-confirm.test.ts`; these cases target
 * the branches the route tests cannot reach (npc discriminator, template
 * lookup on the location path).
 */

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChatSetupTemplates, } from "../../test-utils/insert-helpers";
import { insertGeneratedEntity, } from "./create-entity";

describe("insertGeneratedEntity", () => {
  let db: Kysely<DB>;
  const userId = "user-npc-fixture";
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: "npc-fixture",
        display_name: "NPC Fixture",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await db
      .insertInto("actors",)
      .values({
        id: userId,
        actor_type: "user",
        display_name: "NPC Fixture",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
    worldId = "world-npc-fixture";
    await db
      .insertInto("worlds",)
      .values({
        id: worldId,
        owner_id: userId,
        name: "NPC Fixture World",
        description: "fixture world",
        difficulty_modifier: 1,
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("npc drafts land in actors with agent_type npc", async () => {
    const inserted = await insertGeneratedEntity(db, {
      kind: "npc",
      data: {
        name: "Innkeeper",
        description: "Runs the local inn.",
        personality: "Gruff but fair.",
        appearance: "Broad, grey-bearded.",
      },
      description: "runs an inn",
    }, userId,);

    expect(inserted.kind,).toBe("npc",);
    const actor = await db
      .selectFrom("actors",)
      .select(["agent_type", "actor_type", "default_outfit", "outfits",])
      .where("id", "=", inserted.id,)
      .executeTakeFirst();
    expect(actor?.agent_type,).toBe("npc",);
    expect(actor?.actor_type,).toBe("character",);
    // appearance doubles as the default outfit when none is supplied
    expect(actor?.default_outfit,).toBe("Broad, grey-bearded.",);
    expect(actor?.outfits,).toContain("Broad, grey-bearded.",);
  },);

  test("npc lore lands in actor_lore_entries", async () => {
    const inserted = await insertGeneratedEntity(db, {
      kind: "npc",
      data: {
        name: "Lorekeeper",
        description: "Keeps the town archive.",
        personality: "Patient.",
        appearance: "Robe-covered.",
        lore: [{ name: "Archive Key", content: "Holds the east wing.", keys: ["archive",], }],
      },
      description: "keeps records",
    }, userId,);

    const lore = await db
      .selectFrom("actor_lore_entries",)
      .select("name",)
      .where("actor_id", "=", inserted.id,)
      .execute();
    expect(lore.map((l,) => l.name,),).toEqual(["Archive Key",],);
  },);

  test("location creation binds a public chat when template-world exists", async () => {
    await insertChatSetupTemplates(db, "world", "World Chat", {
      id: "template-world",
      mode: "story",
      turn_strategy: "round_robin",
      visibility: "public",
    },);

    const inserted = await insertGeneratedEntity(db, {
      kind: "location",
      data: { name: "Waystation", description: "A dusty waystation." },
      description: "a waystation",
      worldId,
    }, userId,);

    expect(inserted.linkedChatId,).toBeString();
    const chat = await db
      .selectFrom("chats",)
      .select(["id", "visibility", "template_id", "world_id", "current_location_id", "turn_strategy",])
      .where("id", "=", inserted.linkedChatId!,)
      .executeTakeFirst();
    expect(chat?.current_location_id,).toBe(inserted.id,);
    expect(chat?.world_id,).toBe(worldId,);
    expect(chat?.template_id,).toBe("template-world",);
    expect(chat?.visibility,).toBe("public",);
    expect(chat?.turn_strategy,).toBe("round_robin",);
  },);
});
