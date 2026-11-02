// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * loreSection integration test — inclusion groups (094,
 * epic-lorebook-inclusion-groups).
 *
 * Entries that share a non-empty `inclusion_group` are mutually exclusive:
 * exactly one of them fires per prompt turn. The winner is the entry that
 * matched the most keys; ties go to priority, then insertion order. Entries
 * without a group are unaffected.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemRarity, MessageRole, MessageStatus, MessageVisibility, } from "../../../db/enums";
import { LoreEntryStatus, LorePosition, } from "../../../db/enums-story";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { loreSection, } from "./lore";

const CHAT_ID = "lore-groups-chat";

const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
},);

/** Create a user/actor/world/chat with one user message in the conversation. */
async function setupWorld(db: Kysely<DB>,): Promise<{ worldId: string; actorId: string }> {
  await insertUsers(db, "gm", "GM",);
  const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  await insertActors(db, "Hero",);
  const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  await insertWorlds(db, user.id, "Group World",);
  const world = await db.selectFrom("worlds",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  await insertChats(db, "Group Chat", user.id, { id: CHAT_ID as never, world_id: world.id, },);

  await insertMessages(db, CHAT_ID, actor.id, MessageRole.User, "The dragon guards a hoard.", {
    status: MessageStatus.Confirmed,
    visibility: MessageVisibility.Visible,
  },);

  return { worldId: world.id, actorId: actor.id, };
}

/** Assemble the lore section for the seeded chat. */
function ctxFor(db: Kysely<DB>, worldId: string, actorId: string,): AssembleContext {
  return {
    db,
    actor: {
      id: actorId,
      display_name: "Hero",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: { id: CHAT_ID, mode: "story", world_id: worldId, current_location_id: null, },
    // No selective-keys override: the section must scan the conversation from DB.
    params: { actorId, chatId: CHAT_ID, modelId: "test-model", },
    isStory: true,
    tokenBudget: 4000,
  };
}

/** Insert one selective world-lore entry. */
async function insertLore(
  db: Kysely<DB>,
  worldId: string,
  content: string,
  opts: { keys?: string[]; inclusion_group?: string | null; priority?: number; insertion_order?: number },
): Promise<void> {
  await insertWorldLoreEntries(db, worldId, content, {
    selective: 1,
    constant: 0,
    enabled: LoreEntryStatus.Enabled,
    position: LorePosition.BeforeChar,
    cooldown_seconds: 0,
    keys: JSON.stringify(opts.keys ?? [],),
    inclusion_group: opts.inclusion_group ?? null,
    priority: opts.priority ?? 0,
    insertion_order: opts.insertion_order ?? 0,
  },);
}

describe("loreSection — inclusion groups", () => {
  test("exactly one of two mutually exclusive rumors fires", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db,);
      await insertLore(db, worldId, "Generic dragon rumor.", { keys: ["dragon",], inclusion_group: "rumors", },);
      await insertLore(db, worldId, "Specific hoard rumor.", {
        keys: ["dragon", "hoard",],
        inclusion_group: "rumors",
      },);

      const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("Specific hoard rumor.",);
      expect(text,).not.toContain("Generic dragon rumor.",);
    } finally {
      sqlite.close();
    }
  });

  test("entries without a group are unaffected", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db,);
      await insertLore(db, worldId, "Ungrouped dragon lore.", { keys: ["dragon",], },);
      await insertLore(db, worldId, "Ungrouped hoard lore.", { keys: ["hoard",], },);

      const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("Ungrouped dragon lore.",);
      expect(text,).toContain("Ungrouped hoard lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("a blank group is treated as no group", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db,);
      await insertLore(db, worldId, "Blank group lore.", { keys: ["dragon",], inclusion_group: "", },);
      await insertLore(db, worldId, "Null group lore.", { keys: ["hoard",], inclusion_group: null, },);

      const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("Blank group lore.",);
      expect(text,).toContain("Null group lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("a single-entry group fires", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db,);
      await insertLore(db, worldId, "Lone rumor.", { keys: ["dragon",], inclusion_group: "rumors", },);

      const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("Lone rumor.",);
    } finally {
      sqlite.close();
    }
  });

  test("cooldown excludes the specific entry before the group gate runs", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db,);
      await insertLore(db, worldId, "Generic dragon rumor.", { keys: ["dragon",], inclusion_group: "rumors", },);
      // The two-key entry would win the group, but it is still cooling down.
      await insertWorldLoreEntries(db, worldId, "Specific hoard rumor.", {
        selective: 1,
        constant: 0,
        enabled: LoreEntryStatus.Enabled,
        position: LorePosition.BeforeChar,
        keys: JSON.stringify(["dragon", "hoard",],),
        inclusion_group: "rumors",
        cooldown_seconds: 3600,
        last_activated: new Date().toISOString(),
      },);

      const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("Generic dragon rumor.",);
      expect(text,).not.toContain("Specific hoard rumor.",);
    } finally {
      sqlite.close();
    }
  });

  test("a rare group member dropped by its rarity weight lets the other member fire", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db,);
      await insertLore(db, worldId, "Generic dragon rumor.", { keys: ["dragon",], inclusion_group: "rumors", },);
      // The two-key entry would win the group, but its rarity weight (0.5)
      // drops it from this turn's admission.
      await insertWorldLoreEntries(db, worldId, "Rare hoard rumor.", {
        selective: 1,
        constant: 0,
        enabled: LoreEntryStatus.Enabled,
        position: LorePosition.BeforeChar,
        keys: JSON.stringify(["dragon", "hoard",],),
        inclusion_group: "rumors",
        cooldown_seconds: 0,
        rarity: ItemRarity.Rare,
      },);

      Math.random = () => 0.9;

      const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("Generic dragon rumor.",);
      expect(text,).not.toContain("Rare hoard rumor.",);
    } finally {
      sqlite.close();
    }
  });
});
