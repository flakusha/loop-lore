/**
 * loreSection integration test — audience-constrained world-lore injection.
 *
 * The live production path (`loreSection.build`) resolves the speaking actor's
 * identity (race from the `species` permanent trait) and gates world + actor
 * lore through `isLoreVisibleTo` BEFORE cooldown/constant/selective activation.
 *
 * This test defends the dark-elves-vs-humans scenario end-to-end at the section
 * level, deterministically (loreSection has no probabilistic step):
 *   - a world-lore entry scoped to race "dark elf" is WITHHELD from a human speaker;
 *   - the SAME entry is REVEALED to a dark-elf speaker in the same world.
 */
import { describe, expect, test, } from "bun:test";
import type { Generated, Kysely, } from "kysely";
import { TraitCategory, } from "../../../db/enums-character";
import {
  LoreEntryStatus,
  LorePosition,
} from "../../../db/enums-story";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterPermanentTraits,
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { createLogger, } from "../../../logger";
import type { AssembleContext, } from "../types";
import { loreSection, } from "./lore";

describe("loreSection — audience-constrained world-lore injection", () => {
  const elfLore = "The underground castle was abandoned centuries ago.";

  // Insert-helper opts type generated columns as Generated<T>; cast through `unknown`
  // (plain literals are otherwise rejected by the branded type).
  const enabled = LoreEntryStatus.Enabled as unknown as Generated<LoreEntryStatus>;
  const constantOne = 1 as unknown as Generated<number>;
  const beforeChar = LorePosition.BeforeChar as unknown as Generated<LorePosition>;
  const noCooldown = 0 as unknown as Generated<number>;

  async function setupWorld(db: Kysely<DB>,): Promise<{ worldId: string; elfId: string; humanId: string }> {
    await insertUsers(db, "gm", "GM",);
    const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

    await insertActors(db, "Human",);
    await insertActors(db, "Dark Elf",);
    const actors = await db.selectFrom("actors",).select(["id", "display_name",],).execute();
    const humanId = actors.find((a,) => a.display_name === "Human",)!.id;
    const elfId = actors.find((a,) => a.display_name === "Dark Elf",)!.id;

    await insertWorlds(db, user.id, "Castle World",);
    const world = await db.selectFrom("worlds",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    const worldId = world.id;

    // Dark-elf race identity (species permanent trait).
    const now = new Date().toISOString();
    await insertCharacterPermanentTraits(
      db,
      elfId,
      TraitCategory.Identity,
      "species",
      "dark elf",
      now,
      now,
    );

    // One world-lore entry scoped to race "dark elf", always-eligible (constant).
    await insertWorldLoreEntries(db, worldId, elfLore, {
      audience_scope: JSON.stringify({ subject: { kind: "race", race: "dark elf", }, },),
      enabled,
      constant: constantOne,
      position: beforeChar,
      cooldown_seconds: noCooldown,
    },);

    return { worldId, elfId, humanId, };
  }

  function ctxFor(db: Kysely<DB>, worldId: string, actorId: string, displayName: string,): AssembleContext {
    return {
      db,
      actor: {
        id: actorId,
        display_name: displayName,
        system_prompt: null,
        description: null,
        personality: null,
        scenario: null,
        post_history_instructions: null,
        mes_example: null,
        agent_role: null,
      },
      chat: { id: "chat-lore-1", mode: "story", world_id: worldId, current_location_id: null, },
      // Empty selective-keys avoids a `recentUserWords` DB lookup; constant entries
      // activate regardless of keywords, so this is safe.
      params: { actorId, chatId: "chat-lore-1", modelId: "test-model", selectiveKeys: [], },
      isStory: true,
      tokenBudget: 4000,
    };
  }

  test("withholds race-scoped world lore from a human, reveals it to a dark elf", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }

    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, elfId, humanId, } = await setupWorld(db,);

      // A human (no species trait => race "human") must NOT receive the elf-scoped lore.
      const humanMessages = await loreSection.build(ctxFor(db, worldId, humanId, "Human",),);
      const humanText = humanMessages.map((m,) => m.content,).join("\n",);
      expect(humanText).not.toContain("abandoned centuries ago");

      // A dark elf (species trait "dark elf") MUST receive the same entry.
      const elfMessages = await loreSection.build(ctxFor(db, worldId, elfId, "Dark Elf",),);
      const elfText = elfMessages.map((m,) => m.content,).join("\n",);
      expect(elfText).toContain("abandoned centuries ago");
      expect(elfMessages.some((m,) => m.content.includes("lore",),),).toBe(true);
    } finally {
      sqlite.close();
    }
  },);
});
