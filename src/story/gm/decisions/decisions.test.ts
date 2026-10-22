// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM decision strategy tests — hardcoded fallback, human placeholder,
 * registry completeness, and the hybrid crowd-nudge.
 *
 * Resource contract: the hybrid tests each own a private in-memory SQLite DB
 * from `createTestDb()` (`:memory:` per call — no shared paths), released via
 * `finally { sqlite.close(); }`. All other tests are pure. Order-independent.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { GameMasterType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import type { StoryContext, } from "../../types";
import { hardcodedDecision, } from "./hardcoded";
import { humanDecision, } from "./human";
import { hybridDecision, } from "./hybrid";
import { GM_DECISIONS, } from "./registry";
import type { GmDecisionDeps, } from "./types";

// ── fixtures ─────────────────────────────────────────────────

function makeContext(overrides: Partial<StoryContext> = {},): StoryContext {
  return {
    world: {
      id: "world-1",
      name: "Test World",
      lore: "",
      currentLocation: {
        id: "loc-1",
        name: "Tavern",
        description: "",
        atmosphere: "smoky and warm",
        timeOfDay: null,
        weather: null,
      },
    },
    activeQuests: [],
    actors: [
      {
        id: "actor-1",
        displayName: "Kara",
        actorType: "npc",
        agentType: "npc",
        systemPrompt: null,
        locationId: "loc-1",
      },
    ],
    recentTurns: [],
    turnManagerState: {} as StoryContext["turnManagerState"],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<GmDecisionDeps> = {},): GmDecisionDeps {
  return {
    config: { type: GameMasterType.Llm, },
    generateText: async () => "ok",
    db: null as unknown as Kysely<DB>,
    chatId: "chat-1",
    ...overrides,
  };
}

// ── hardcodedDecision ────────────────────────────────────────

describe("hardcodedDecision", () => {
  test("builds a deterministic in-character prompt for a known actor", () => {
    const ctx = makeContext();
    const decision = hardcodedDecision(makeDeps(), ctx, "actor-1",);

    expect(decision.nextActorId,).toBe("actor-1",);
    expect(decision.turnPrompt,).toContain("You are Kara.",);
    expect(decision.turnPrompt,).toContain("Location: Tavern.",);
    expect(decision.turnPrompt,).toContain("Atmosphere: smoky and warm.",);
    expect(decision.fallback,).toBeUndefined();
    expect(decision.questUpdates,).toEqual([],);
    expect(decision.worldStateChanges,).toEqual([],);
  });

  test("falls back to 'unknown' for an actor id missing from the context", () => {
    const decision = hardcodedDecision(makeDeps(), makeContext(), "who-is-this",);
    expect(decision.turnPrompt,).toContain("You are unknown.",);
    expect(decision.nextActorId,).toBe("who-is-this",);
  });

  test("includes npc state health, mental state, and stacked inventory counts", () => {
    const ctx = makeContext({
      actors: [
        {
          id: "actor-1",
          displayName: "Kara",
          actorType: "npc",
          agentType: "npc",
          systemPrompt: null,
          locationId: "loc-1",
          npcState: {
            health: 42,
            mental_state: "wary",
            knowledge: {},
            relationships: {},
            inventory: [
              {
                worldItemId: "w1",
                itemId: "i1",
                name: "Iron Sword",
                quantity: 2,
                properties: { effects: [], },
                weight: 1,
                visibility: "visible",
              },
              {
                worldItemId: "w2",
                itemId: "i2",
                name: "Torch",
                quantity: 1,
                properties: { effects: [], },
                weight: 1,
                visibility: "visible",
              },
            ],
            schedule: {},
          },
        },
      ],
    },);

    const prompt = hardcodedDecision(makeDeps(), ctx, "actor-1",).turnPrompt;
    expect(prompt,).toContain("Health: 42/100.",);
    expect(prompt,).toContain("Mental state: wary.",);
    expect(prompt,).toContain("Carrying: Iron Sword×2, Torch.",);
  });

  test("omits inventory and atmosphere lines when absent, defaults maxTokens to 800", () => {
    const ctx = makeContext();
    ctx.world.currentLocation.atmosphere = null;
    const decision = hardcodedDecision(
      makeDeps({ config: { type: GameMasterType.Llm, }, },),
      ctx,
      "actor-1",
    );

    expect(decision.turnPrompt,).not.toContain("Carrying:",);
    expect(decision.turnPrompt,).not.toContain("Atmosphere:",);
    expect(decision.turnConstraints.maxTokens,).toBe(800,);
    expect(decision.turnConstraints.tone,).toBeUndefined();
  });

  test("carries active quest, previous turn, and GM guidance into the prompt", () => {
    const ctx = makeContext({
      activeQuests: [
        { id: "q1", name: "Find the Relic", type: "collection" as never, progress: 2, target: 5, config: {} as never, },
      ],
      recentTurns: [
        {
          turnNumber: 1,
          actorId: "actor-1",
          turnType: "gm" as never,
          prompt: "",
          response: "Kara scans the room.",
          qualityScore: null,
        },
      ],
    },);

    const deps = makeDeps({
      gmGuidance: {
        constraints: ["no combat", "stay subtle",],
        sceneDescription: "A cloaked stranger watches from the corner.",
      } as GmDecisionDeps["gmGuidance"],
    },);

    const decision = hardcodedDecision(deps, ctx, "actor-1",);

    expect(decision.turnPrompt,).toContain('Active quest: "Find the Relic" (2/5).',);
    expect(decision.turnPrompt,).toContain('Previous: Kara said/did: "Kara scans the room."',);
    expect(decision.turnPrompt,).toContain("GM guidance — constraints: no combat; stay subtle",);
    expect(decision.turnPrompt,).toContain(
      "GM scene direction: A cloaked stranger watches from the corner.",
    );
  });

  test("honors configured maxTokens and uses atmosphere as tone", () => {
    const decision = hardcodedDecision(
      makeDeps({ config: { type: GameMasterType.Llm, llmConfig: { maxTokens: 321, } as never, }, },),
      makeContext(),
      "actor-1",
    );

    expect(decision.turnConstraints.maxTokens,).toBe(321,);
    expect(decision.turnConstraints.tone,).toBe("smoky and warm",);
  });
});

// ── humanDecision ────────────────────────────────────────────

describe("humanDecision", () => {
  test("emits a placeholder naming the actor and includes GM guidance", () => {
    const deps = makeDeps({
      gmGuidance: {
        constraints: ["keep it short",],
        sceneDescription: "Rain hammers the windows.",
      } as GmDecisionDeps["gmGuidance"],
    },);

    const decision = humanDecision(deps, makeContext(), "actor-1",);

    expect(decision.nextActorId,).toBe("actor-1",);
    expect(decision.turnPrompt,).toContain("[Human GM] Select prompt for Kara...",);
    expect(decision.turnPrompt,).toContain("GM guidance — constraints: keep it short",);
    expect(decision.turnPrompt,).toContain("GM scene direction: Rain hammers the windows.",);
    expect(decision.turnConstraints,).toEqual({ maxTokens: 800, },);
  });

  test("falls back to 'actor' when the actor id is unknown", () => {
    const decision = humanDecision(makeDeps(), makeContext(), "ghost",);
    expect(decision.turnPrompt,).toContain("[Human GM] Select prompt for actor...",);
  });
});

// ── registry ─────────────────────────────────────────────────

describe("GM_DECISIONS registry", () => {
  test("has a strategy for every GameMasterType", () => {
    for (const type of Object.values(GameMasterType,)) {
      expect(typeof GM_DECISIONS[type],).toBe("function",);
    }
  });

  test("maps each type to its dedicated strategy", () => {
    expect(GM_DECISIONS[GameMasterType.Human],).toBe(humanDecision,);
    expect(GM_DECISIONS[GameMasterType.Hybrid],).toBe(hybridDecision,);
    expect(GM_DECISIONS[GameMasterType.Llm],).not.toBe(hardcodedDecision,);
  });
});

// ── hybridDecision ───────────────────────────────────────────

describe("hybridDecision", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>["db"];
  let sqlite: Awaited<ReturnType<typeof createTestDb>>["sqlite"];

  beforeAll(async () => {
    const env = await createTestDb();
    db = env.db;
    sqlite = env.sqlite;
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("marks the turn as fallback when the LLM path fails", async () => {
    const deps = makeDeps({
      db,
      generateText: async () => {
        throw new Error("provider down",);
      },
    },);

    const decision = await hybridDecision(deps, makeContext(), "actor-1",);

    expect(decision.fallback,).toBe(true,);
    expect(decision.nextActorId,).toBe("actor-1",);
    expect(decision.turnConstraints.focus,).toBeUndefined();
  });

  test("nudges focus when the scene is crowded (more than 8 actors)", async () => {
    const manyActors = Array.from({ length: 9, }, (_, i,) => ({
      id: `actor-${i}`,
      displayName: `NPC ${i}`,
      actorType: "npc",
      agentType: "npc",
      systemPrompt: null,
      locationId: "loc-1",
    }),);

    const deps = makeDeps({
      db,
      generateText: async () => {
        throw new Error("provider down",);
      },
    },);

    const decision = await hybridDecision(deps, makeContext({ actors: manyActors, },), "actor-1",);

    expect(decision.turnConstraints.focus,).toBe("Keep it simple — complex scene",);
  });

  test("does not nudge focus for a calm scene", async () => {
    const deps = makeDeps({
      db,
      generateText: async () => {
        throw new Error("provider down",);
      },
    },);

    const decision = await hybridDecision(deps, makeContext(), "actor-1",);
    expect(decision.turnConstraints.focus,).toBeUndefined();
  });
});
