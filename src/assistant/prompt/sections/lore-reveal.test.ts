/**
 * loreSection reveal/timeline/rarity integration tests (epic-lore-knowledge).
 *
 * Drives the real `loreSection.build` path over the 084 columns:
 *   - secret lore (`reveal_condition`) withheld until conversation keywords
 *     or timeline events satisfy the condition; malformed JSON fails closed;
 *   - timeline-scoped rows (`timeline_id`) filtered against the chat's
 *     timeline at load time (NULL = every timeline);
 *   - rarity-weighted selection admits non-common tiers stochastically.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../../db/enums";
import { LoreEntryStatus, LorePosition, } from "../../../db/enums-story";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActorLoreEntries,
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
  insertWorldLoreEntries,
  insertWorlds,
  insertWorldTimelineEvents,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { loreSection, } from "./lore";

const enabled = LoreEntryStatus.Enabled;
const constantOne = 1;
const beforeChar = LorePosition.BeforeChar;
const noCooldown = 0;
const CHAT_ID = "lore-reveal-chat";

const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
},);

/** Create logger once per process; ignore re-initialization. */
function createLoggerSafe(): void {
  try {
    createLogger({ level: "error", },);
  } catch {
    // Already initialized — ignore.
  }
}

/** User + actor + world + chat on `timelineId`, with messages (chronological). */
async function setupWorld(
  db: Kysely<DB>,
  messages: string[],
  timelineId?: string,
): Promise<{ worldId: string; actorId: string; userId: string }> {
  await insertUsers(db, "gm", "GM",);
  const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  await insertActors(db, "Hero",);
  const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  await insertWorlds(db, user.id, "Reveal World",);
  const world = await db.selectFrom("worlds",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  await insertChats(db, "Reveal Chat", user.id, {
    id: CHAT_ID as never,
    world_id: world.id,
    ...(timelineId ? { timeline_id: timelineId, } : {}),
  },);

  const baseTime = Date.UTC(2026, 0, 1,);
  for (const [i, msg,] of messages.entries()) {
    await insertMessages(db, CHAT_ID, actor.id, MessageRole.User, msg, {
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
      created_at: new Date(baseTime + i * 60_000,).toISOString(),
    },);
  }

  return { worldId: world.id, actorId: actor.id, userId: user.id, };
}

/** Render the lore section for the standard chat (optionally on a timeline). */
async function render(
  db: Kysely<DB>,
  worldId: string,
  actorId: string,
  timelineId?: string,
): Promise<string> {
  const ctx: AssembleContext = {
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
    chat: {
      id: CHAT_ID,
      mode: "story",
      world_id: worldId,
      current_location_id: null,
      timeline_id: timelineId ?? null,
    },
    params: { actorId, chatId: CHAT_ID, modelId: "test-model", },
    isStory: true,
    tokenBudget: 4000,
  };

  const built = await loreSection.build(ctx,);
  return built.map((m,) => m.content).join("\n",);
}

describe("loreSection — secret reveal conditions (epic-lore-knowledge)", () => {
  test("keyword-gated secret stays hidden until the keyword is spoken", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["Plan your next move.",],);
      await insertWorldLoreEntries(db, worldId, "The beacon signals the hidden fleet.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        reveal_condition: JSON.stringify({ keywords: ["beacon",], },),
      },);

      const hidden = await render(db, worldId, actorId,);
      expect(hidden,).not.toContain("hidden fleet",);

      await insertMessages(db, CHAT_ID, actorId, MessageRole.User, "We light the beacon tonight.", {
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.Visible,
        created_at: new Date(Date.UTC(2026, 0, 1, 1,),).toISOString(),
      },);

      const revealed = await render(db, worldId, actorId,);
      expect(revealed,).toContain("hidden fleet",);
    } finally {
      sqlite.close();
    }
  });

  test("malformed reveal condition fails closed (never revealed)", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["We light the beacon tonight.",],);
      await insertWorldLoreEntries(db, worldId, "Corrupted secret.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        reveal_condition: "not-json",
      },);

      expect(await render(db, worldId, actorId,),).not.toContain("Corrupted secret.",);
    } finally {
      sqlite.close();
    }
  });

  test("timeline-event secret reveals only for events on the chat's timeline", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, [],);
      await insertWorldLoreEntries(db, worldId, "The sky-glass cracked when the meteor fell.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        reveal_condition: JSON.stringify({ event: "meteor_fall", },),
      },);

      // No events yet — hidden.
      expect(await render(db, worldId, actorId,),).not.toContain("sky-glass",);

      // Event on a DIFFERENT timeline must not reveal it.
      await insertWorldTimelineEvents(
        db,
        worldId,
        "meteor_fall",
        "A meteor fell over the bay.",
        new Date(Date.UTC(2026, 0, 2,),).toISOString(),
        { timeline_id: "alt", },
      );

      expect(await render(db, worldId, actorId,),).not.toContain("sky-glass",);

      // Event on the chat's own (default prime) timeline reveals it.
      await insertWorldTimelineEvents(
        db,
        worldId,
        "meteor_fall",
        "A meteor fell on the capital.",
        new Date(Date.UTC(2026, 0, 3,),).toISOString(),
        { timeline_id: "prime", },
      );

      expect(await render(db, worldId, actorId,),).toContain("sky-glass",);
    } finally {
      sqlite.close();
    }
  });

  test("actor lore secrets gate through the same reveal path", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, ["I still dream about the lighthouse.",],);
      await insertActorLoreEntries(db, actorId, "The lighthouse keeper was her father.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        reveal_condition: JSON.stringify({ keywords: ["lighthouse",], },),
      },);

      expect(await render(db, worldId, actorId,),).toContain("lighthouse keeper",);
    } finally {
      sqlite.close();
    }
  });
});

describe("loreSection — timeline-scoped lore (epic-lore-knowledge)", () => {
  test("rows load when timeline-universal or matching the chat's timeline", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, [], "alt",);
      await insertWorldLoreEntries(db, worldId, "Universal lore for every timeline.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
      },);

      await insertWorldLoreEntries(db, worldId, "Alt-timeline only lore.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        timeline_id: "alt",
      },);

      await insertWorldLoreEntries(db, worldId, "Prime-timeline only lore.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        timeline_id: "prime",
      },);

      const text = await render(db, worldId, actorId, "alt",);
      expect(text,).toContain("Universal lore",);
      expect(text,).toContain("Alt-timeline only lore.",);
      expect(text,).not.toContain("Prime-timeline only lore.",);
    } finally {
      sqlite.close();
    }
  });

  test("actor lore rows load when timeline-universal or matching the chat's timeline", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { actorId, } = await setupWorld(db, [], "alt",);
      await insertActorLoreEntries(db, actorId, "Universal actor memory for every timeline.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
      },);

      await insertActorLoreEntries(db, actorId, "Alt-timeline actor secret.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        timeline_id: "alt",
      },);

      await insertActorLoreEntries(db, actorId, "Prime-timeline actor secret.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        timeline_id: "prime",
      },);

      const onAlt = await render(db, "", actorId, "alt",);
      expect(onAlt,).toContain("Universal actor memory",);
      expect(onAlt,).toContain("Alt-timeline actor secret.",);
      expect(onAlt,).not.toContain("Prime-timeline actor secret.",);

      const onPrime = await render(db, "", actorId, "prime",);
      expect(onPrime,).toContain("Universal actor memory",);
      expect(onPrime,).toContain("Prime-timeline actor secret.",);
      expect(onPrime,).not.toContain("Alt-timeline actor secret.",);
    } finally {
      sqlite.close();
    }
  });
});

describe("loreSection — rarity-weighted selection (epic-lore-knowledge)", () => {
  test("artifact-tier entry is admitted by its weight, common always passes", async () => {
    createLoggerSafe();
    const { db, sqlite, } = await createTestDb();
    try {
      const { worldId, actorId, } = await setupWorld(db, [],);
      await insertWorldLoreEntries(db, worldId, "Artifact-tier knowledge.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        rarity: "artifact",
      },);

      await insertWorldLoreEntries(db, worldId, "Common-tier knowledge.", {
        enabled,
        constant: constantOne,
        position: beforeChar,
        cooldown_seconds: noCooldown,
        rarity: "common",
      },);

      Math.random = () => 0.999;
      const thin = await render(db, worldId, actorId,);
      expect(thin,).not.toContain("Artifact-tier knowledge.",);
      expect(thin,).toContain("Common-tier knowledge.",);

      Math.random = () => 0.05;
      const full = await render(db, worldId, actorId,);
      expect(full,).toContain("Artifact-tier knowledge.",);
    } finally {
      sqlite.close();
    }
  });
});
