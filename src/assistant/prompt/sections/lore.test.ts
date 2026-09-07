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
import type { Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../../db/enums";
import { TraitCategory, } from "../../../db/enums-character";
import {
  LoreEntryStatus,
  LorePosition,
} from "../../../db/enums-story";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterPermanentTraits,
  insertChats,
  insertMessages,
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { loreSection, } from "./lore";

describe("loreSection — audience-constrained world-lore injection", () => {
  const elfLore = "The underground castle was abandoned centuries ago.";

  // Insert-helper opts type generated columns as Generated<T>; cast through `unknown`
  // (plain literals are otherwise rejected by the branded type).
  const enabled = LoreEntryStatus.Enabled;
  const constantOne = 1;
  const beforeChar = LorePosition.BeforeChar;
  const noCooldown = 0;

  /**
   * @param db
   */
  async function setupWorld(db: Kysely<DB>,): Promise<{ worldId: string; elfId: string; humanId: string }> {
    await insertUsers(db, "gm", "GM",);
    const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

    await insertActors(db, "Human",);
    await insertActors(db, "Dark Elf",);
    const actors = await db.selectFrom("actors",).select(["id", "display_name",],).execute();
    const humanId = actors.find((a,) => a.display_name === "Human")!.id;
    const elfId = actors.find((a,) => a.display_name === "Dark Elf")!.id;

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

  /**
   * @param db
   * @param worldId
   * @param actorId
   * @param displayName
   */
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
      const humanText = humanMessages.map((m,) => m.content).join("\n",);
      expect(humanText,).not.toContain("abandoned centuries ago",);

      // A dark elf (species trait "dark elf") MUST receive the same entry.
      const elfMessages = await loreSection.build(ctxFor(db, worldId, elfId, "Dark Elf",),);
      const elfText = elfMessages.map((m,) => m.content).join("\n",);
      expect(elfText,).toContain("abandoned centuries ago",);
      expect(elfMessages.some((m,) => m.content.includes("lore",)),).toBe(true,);
    } finally {
      sqlite.close();
    }
  });
});

/**
 * loreSection activation-condition tests (FEAT-055).
 *
 * Covers the enriched selective-activation surface: regex keys, AND/OR key
 * groups, conversation-depth scanning, probability gating, and priority
 * ordering. Each drives the real `loreSection.build` path with the conversation
 * scanned from the DB (no selective-keys override), so activation is decided
 * purely by the condition under test.
 */
describe("loreSection — activation conditions (FEAT-055)", () => {
  const enabled = LoreEntryStatus.Enabled;
  const selectiveOne = 1;
  const constantZero = 0;
  const beforeChar = LorePosition.BeforeChar;
  const noCooldown = 0;

  const CHAT_ID = "lore-activation-chat";

  /**
   * Create a user/actor/world/chat with a given conversation history (messages
   * supplied in chronological order; the LAST is the most recent). No lore
   * entries are inserted here — tests add entries per condition.
   * @param db
   * @param messages
   */
  async function setupWorld(
    db: Kysely<DB>,
    messages: string[],
  ): Promise<{ worldId: string; actorId: string }> {
    await insertUsers(db, "gm", "GM",);
    const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

    await insertActors(db, "Hero",);
    const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    const actorId = actor.id;

    await insertWorlds(db, user.id, "Activation World",);
    const world = await db.selectFrom("worlds",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    const worldId = world.id;

    await insertChats(db, "Activation Chat", user.id, { id: CHAT_ID as never, world_id: worldId, },);

    const baseTime = Date.UTC(2026, 0, 1,);
    for (const [i, msg,] of messages.entries()) {
      await insertMessages(
        db,
        CHAT_ID,
        actorId,
        MessageRole.User,
        msg,
        {
          status: MessageStatus.Confirmed,
          visibility: MessageVisibility.Visible,
          created_at: new Date(baseTime + i * 60_000,).toISOString(),
        },
      );
    }

    return { worldId, actorId, };
  }

  /**
   * @param db
   * @param worldId
   * @param actorId
   */
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

  /** Fields the activation tests vary — structurally compatible with the helper opts. */
  interface ActivationLoreOpts {
    keys?: string;
    key_type?: string;
    key_groups?: string;
    scan_depth?: number;
    activation_chance?: number;
    priority?: number;
  }

  /**
   * Insert one unconstrained selective world-lore entry and render the section.
   * @param db
   * @param worldId
   * @param actorId
   * @param loreContent
   * @param loreOpts
   */
  async function render(
    db: Kysely<DB>,
    worldId: string,
    actorId: string,
    loreContent: string,
    loreOpts: ActivationLoreOpts,
  ): Promise<string> {
    await insertWorldLoreEntries(db, worldId, loreContent, {
      selective: selectiveOne,
      constant: constantZero,
      enabled,
      position: beforeChar,
      cooldown_seconds: noCooldown,
      ...loreOpts,
    },);
    const built = await loreSection.build(ctxFor(db, worldId, actorId,),);
    return built.map((m,) => m.content).join("\n",);
  }

  test("regex key activates on any part of the scanned conversation window", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["Plan your next move.", "The queen is Elara.",],);
      const text = await render(
        db,
        worldId,
        actorId,
        "Elara is the rightful queen.",
        { key_type: "regex", keys: JSON.stringify([String.raw`\bElara\b`,],), },
      );
      expect(text,).toContain("Elara is the rightful queen.",);
    } finally {
      sqlite.close();
    }
  });

  test("invalid regex key is treated as no-match and never crashes prompt assembly", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["Plan your next move.", "The queen is Elara.",],);
      const text = await render(
        db,
        worldId,
        actorId,
        "Unreachable lore.",
        { key_type: "regex", keys: JSON.stringify(["[",],), },
      );
      expect(text,).not.toContain("Unreachable lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("key groups: AND within a group satisfies activation", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["The wolf is in the forest.",],);
      const text = await render(
        db,
        worldId,
        actorId,
        "Forest wolf lore.",
        { key_groups: JSON.stringify([["wolf", "forest",], ["beast",],],), },
      );
      expect(text,).toContain("Forest wolf lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("key groups: OR across groups activates via any single group", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["A beast stalks the road.",],);
      const text = await render(
        db,
        worldId,
        actorId,
        "Beast lore.",
        { key_groups: JSON.stringify([["wolf", "forest",], ["beast",],],), },
      );
      expect(text,).toContain("Beast lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("key groups: no group satisfied means no activation", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["A wolf howls.",],);
      const text = await render(
        db,
        worldId,
        actorId,
        "Lost lore.",
        { key_groups: JSON.stringify([["wolf", "forest",], ["beast",],],), },
      );
      expect(text,).not.toContain("Lost lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("scan_depth 1 does not activate on an older message", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      // "forest" appears only in the OLDER message; the newest mentions "road".
      const messages = ["The forest rustles.", "They take the road.",];
      const { worldId, actorId, } = await setupWorld(db, messages,);
      const text = await render(
        db,
        worldId,
        actorId,
        "Deep forest lore.",
        { keys: JSON.stringify(["forest",],), },
      );
      expect(text,).not.toContain("Deep forest lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("scan_depth 2 activates on an older message", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const messages = ["The forest rustles.", "They take the road.",];
      const { worldId, actorId, } = await setupWorld(db, messages,);
      const text = await render(
        db,
        worldId,
        actorId,
        "Deep forest lore.",
        { keys: JSON.stringify(["forest",],), scan_depth: 2, },
      );
      expect(text,).toContain("Deep forest lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("scan_depth is clamped to a maximum of 10", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const messages = ["The forest rustles.", "They take the road.",];
      const { worldId, actorId, } = await setupWorld(db, messages,);
      const text = await render(
        db,
        worldId,
        actorId,
        "Deep forest lore.",
        { keys: JSON.stringify(["forest",],), scan_depth: 99, },
      );
      // Clamped max 10 still covers the 2-message window → activates.
      expect(text,).toContain("Deep forest lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("activation_chance 1 always injects", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["The wolf is near.",],);
      const text = await render(
        db,
        worldId,
        actorId,
        "Always lore.",
        { keys: JSON.stringify(["wolf",],), activation_chance: 1, },
      );
      expect(text,).toContain("Always lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("activation_chance 0 never injects", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["The wolf is near.",],);
      const text = await render(
        db,
        worldId,
        actorId,
        "Never lore.",
        { keys: JSON.stringify(["wolf",],), activation_chance: 0, },
      );
      expect(text,).not.toContain("Never lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("selective entry with empty keys still activates (backward compatible)", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["The wolf is near.",],);
      // No keys/group/regex → treated as always-active, matching pre-FEAT-055 behavior.
      const text = await render(db, worldId, actorId, "Unconditioned lore.", {},);
      expect(text,).toContain("Unconditioned lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("priority orders included entries high-first", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["The wolf is near.",],);

      await insertWorldLoreEntries(db, worldId, "Low priority lore.", {
        keys: '["wolf"]',
        selective: selectiveOne,
        constant: constantZero,
        enabled,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        priority: 1,
      } as never,);
      await insertWorldLoreEntries(db, worldId, "High priority lore.", {
        keys: '["wolf"]',
        selective: selectiveOne,
        constant: constantZero,
        enabled,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        priority: 10,
      } as never,);

      const text = (await loreSection.build(ctxFor(db, worldId, actorId,),))
        .map((m,) => m.content).join("\n",);
      const lowIdx = text.indexOf("Low priority lore.",);
      const highIdx = text.indexOf("High priority lore.",);
      expect(lowIdx,).toBeGreaterThan(-1,);
      expect(highIdx,).toBeGreaterThan(-1,);
      expect(highIdx,).toBeLessThan(lowIdx,);
    } finally {
      sqlite.close();
    }
  });
});

/** */
function createLoggerSafe(): void {
  try {
    createLogger({ level: "error", },);
  } catch {
    // Already initialized — ignore.
  }
}
