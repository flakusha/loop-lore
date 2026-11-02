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
 *
 * Resource contract (parallel runners execute files in worker processes with
 * a fresh global per file — `bun test --parallel=N --isolate`):
 * - Each test owns its own in-memory SQLite database (`createTestDb`), torn
 *   down in `finally` via `destroyTestDb`. No file paths, ports or shared
 *   collections are used, so tests are independent of each other and of
 *   their order.
 * - The only global this file mutates is `Math.random` (one test needs a
 *   deterministic rarity roll). It is restored in `afterEach`, so a failing
 *   test cannot leak the stub into the next one.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ItemRarity, MessageRole, MessageStatus, MessageVisibility, } from "../../../db/enums";
import { LoreEntryStatus, LorePosition, } from "../../../db/enums-story";
import type { DB, } from "../../../db/schema";
import { createTestDb, destroyTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorLoreEntries,
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

  await insertChats(db, "Group Chat", user.id, { id: CHAT_ID, world_id: world.id, },);

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

/** Options for the selective world-lore entries used by these tests. */
interface LoreInsertOptions {
  /** Selective keys the entry is activated by. */
  keys?: string[];
  /** Inclusion group name; `null`/absent means "no group". */
  inclusion_group?: string | null;
  /** Entry priority (higher wins a tie). */
  priority?: number;
  /** Insertion order (later wins a tie after priority). */
  insertion_order?: number;
}

/** Insert one selective world-lore entry. */
async function insertLore(
  db: Kysely<DB>,
  worldId: string,
  content: string,
  opts: LoreInsertOptions,
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
      await destroyTestDb({ db, sqlite, },);
    }
  });

  test("entries without a group are unaffected", async () => {
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
      await destroyTestDb({ db, sqlite, },);
    }
  });

  test("a blank group is treated as no group", async () => {
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
      await destroyTestDb({ db, sqlite, },);
    }
  });

  test("a single-entry group fires", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db,);
      await insertLore(db, worldId, "Lone rumor.", { keys: ["dragon",], inclusion_group: "rumors", },);

      const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("Lone rumor.",);
    } finally {
      await destroyTestDb({ db, sqlite, },);
    }
  });

  test("cooldown excludes the specific entry before the group gate runs", async () => {
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
      await destroyTestDb({ db, sqlite, },);
    }
  });

  test("a rare group member dropped by its rarity weight lets the other member fire", async () => {
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
      await destroyTestDb({ db, sqlite, },);
    }
  });

  test("group members that share a row id across the two tables are ranked independently", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db,);
      const sharedId = "shared-lore-row-id";
      // Same row id in both lore tables: the matched-key counts must stay
      // per entry (actor row matches one key, world row matches two), so the
      // world row wins the group instead of the actor row.
      await insertActorLoreEntries(db, actorId, "Actor dragon rumor.", {
        id: sharedId,
        selective: 1,
        constant: 0,
        enabled: LoreEntryStatus.Enabled,
        position: LorePosition.BeforeChar,
        keys: JSON.stringify(["dragon",],),
        inclusion_group: "rumors",
        cooldown_seconds: 0,
      },);

      await insertWorldLoreEntries(db, worldId, "World hoard rumor.", {
        id: sharedId,
        selective: 1,
        constant: 0,
        enabled: LoreEntryStatus.Enabled,
        position: LorePosition.BeforeChar,
        keys: JSON.stringify(["dragon", "hoard",],),
        inclusion_group: "rumors",
        cooldown_seconds: 0,
      },);

      const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
      const text = built.map((m,) => m.content).join("\n",);

      expect(text,).toContain("World hoard rumor.",);
      expect(text,).not.toContain("Actor dragon rumor.",);
    } finally {
      await destroyTestDb({ db, sqlite, },);
    }
  });
});
