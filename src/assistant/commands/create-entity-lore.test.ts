// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for `insertEntityLore` — the lore-row writer used by the
 * assistant `/create` path.
 *
 * Both lore tables declare `id` as a TEXT PRIMARY KEY with no database
 * default, so the writer MUST pass one. A row stored with `id = NULL` cannot
 * be addressed by id: the prompt section's cooldown write-back
 * (`UPDATE ... WHERE id = ?`) matches 0 rows, `last_activated` stays NULL and
 * the entry is re-injected into every prompt forever.
 *
 * These tests exercise the real writer + the real prompt section, so they fail
 * when the id is omitted and pass when it is supplied.
 */

import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { loreSection, } from "../prompt/sections/lore";
import type { AssembleContext, } from "../prompt/types";
import { insertEntityLore, } from "./create-entity-lore";

const CHAT_ID = "lore-id-regression-chat";

/**
 * Insert a user, an actor, a world and a chat the prompt section can load.
 * @param db
 * @returns The actor id and world id the lore rows belong to.
 */
async function setupWorld(
  db: Parameters<typeof insertEntityLore>[0],
): Promise<{ actorId: string; worldId: string }> {
  await insertUsers(db, "lore-id-owner", "Lore Id Owner",);
  const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  const actorId = await insertActors(db, "Lore Hero",);
  const worldId = await insertWorlds(db, user.id, "Lore Id World",);

  await insertChats(db, "Lore Id Chat", user.id, { id: CHAT_ID, world_id: worldId, },);

  return { actorId, worldId, };
}

/**
 * Build the prompt context the lore section consumes.
 * @param db
 * @param actorId
 * @param worldId
 */
function ctxFor(
  db: Parameters<typeof insertEntityLore>[0],
  actorId: string,
  worldId: string,
): AssembleContext {
  return {
    db,
    actor: {
      id: actorId,
      display_name: "Lore Hero",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: { id: CHAT_ID, mode: "story", world_id: worldId, current_location_id: null, },
    params: { actorId, chatId: CHAT_ID, modelId: "test-model", selectiveKeys: [], },
    isStory: true,
    tokenBudget: 4000,
  };
}

describe("insertEntityLore — stored rows must carry an id", () => {
  test("actor lore rows store a non-null id", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { actorId, } = await setupWorld(db,);

      await insertEntityLore(db, "character", actorId, undefined, [{
        name: "Archive Key",
        content: "Holds the east wing.",
        cooldown_seconds: 3600,
      },],);

      const rows = await db
        .selectFrom("actor_lore_entries",)
        .select(["id", "last_activated",],)
        .where("actor_id", "=", actorId,)
        .execute();

      expect(rows.length,).toBe(1,);
      // A NULL id makes the row unaddressable — the write-back below can
      // never match it.
      expect(rows[0]!.id,).not.toBeNull();
      expect(rows[0]!.id.length,).toBeGreaterThan(0,);
      expect(rows[0]!.last_activated,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("world lore rows store a non-null id", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, } = await setupWorld(db,);

      await insertEntityLore(db, "world", worldId, worldId, [{
        name: "Old Kingdom",
        content: "The old kingdom fell a century ago.",
        cooldown_seconds: 3600,
      },],);

      const rows = await db
        .selectFrom("world_lore_entries",)
        .select(["id",],)
        .where("world_id", "=", worldId,)
        .execute();

      expect(rows.length,).toBe(1,);
      expect(rows[0]!.id,).not.toBeNull();
      expect(rows[0]!.id.length,).toBeGreaterThan(0,);
    } finally {
      sqlite.close();
    }
  });

  test("the cooldown write-back stamps last_activated on the created row", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { actorId, worldId, } = await setupWorld(db,);

      await insertEntityLore(db, "character", actorId, undefined, [{
        name: "Archive Key",
        content: "Holds the east wing.",
        cooldown_seconds: 3600,
      },],);

      const before = await db
        .selectFrom("actor_lore_entries",)
        .select(["last_activated",],)
        .where("actor_id", "=", actorId,)
        .executeTakeFirstOrThrow();

      expect(before.last_activated,).toBeNull();

      await loreSection.build(ctxFor(db, actorId, worldId,),);

      const after = await db
        .selectFrom("actor_lore_entries",)
        .select(["last_activated",],)
        .where("actor_id", "=", actorId,)
        .executeTakeFirstOrThrow();

      // The write-back addresses the row by id — with a NULL id it updates 0
      // rows and the cooldown never starts.
      expect(after.last_activated,).not.toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
