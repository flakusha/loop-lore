// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hardcoded GM decision coverage — prompt assembly for unknown actors,
 * inventory display, quest/turn context, and GM guidance, plus constraint
 * defaults. Pure: no DB or LLM involved.
 */
import { describe, expect, test, } from "bun:test";
import { QuestType, } from "../../../db/enums.js";
import type { StoryContext, } from "../../types.js";
import { hardcodedDecision, } from "./hardcoded.js";
import type { GmDecisionDeps, } from "./types.js";

/**
 * @param partial
 */
function context(partial: Partial<StoryContext> = {},): StoryContext {
  return {
    world: {
      id: "w1",
      name: "Test World",
      lore: "",
      currentLocation: {
        id: "loc-1",
        name: "Tavern",
        description: "A dusty tavern",
        atmosphere: "cozy",
        timeOfDay: null,
        weather: null,
      },
    },
    activeQuests: [],
    actors: [
      {
        id: "actor-1",
        displayName: "Hero",
        actorType: "character",
        agentType: "persona",
        systemPrompt: null,
        locationId: "loc-1",
      },
    ],
    recentTurns: [],
    turnManagerState: {
      currentTurn: 1,
      currentActorId: "actor-1",
      turnOrder: ["actor-1",],
      strategy: "round_robin" as never,
      isPaused: false,
      lastTurnCompletedAt: null,
      pendingRegeneration: null,
    },
    ...partial,
  };
}

/**
 * @param partial
 */
function deps(partial: Partial<GmDecisionDeps> = {},): GmDecisionDeps {
  return {
    config: { type: "hardcoded" as never, },
    generateText: async () => "",
    db: {} as never,
    chatId: "chat-1",
    ...partial,
  };
}

describe("hardcodedDecision", () => {
  test("addresses the selected actor and defaults maxTokens to 800", async () => {
    const d = await hardcodedDecision(deps(), context(), "actor-1",);
    expect(d.nextActorId,).toBe("actor-1",);
    expect(d.turnPrompt,).toContain("You are Hero.",);
    expect(d.turnConstraints.maxTokens,).toBe(800,);
    expect(d.turnConstraints.tone,).toBe("cozy",);
    expect(d.questUpdates,).toEqual([],);
    expect(d.worldStateChanges,).toEqual([],);
  });

  test("unknown actor falls back to the unknown label", async () => {
    const d = await hardcodedDecision(deps(), context(), "ghost-actor",);
    expect(d.nextActorId,).toBe("ghost-actor",);
    expect(d.turnPrompt,).toContain("You are unknown.",);
  });

  test("npc health, mental state, and stacked inventory appear in the prompt", async () => {
    const ctx = context({
      actors: [
        {
          id: "actor-1",
          displayName: "Hero",
          actorType: "character",
          agentType: "persona",
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
                name: "Torch",
                description: "",
                category: "tool" as never,
                rarity: "common" as never,
                quantity: 2,
                properties: {},
                value: 0,
                weight: 0,
                visibility: "visible" as never,
              },
              {
                worldItemId: "w2",
                itemId: "i2",
                name: "Dagger",
                description: "",
                category: "weapon" as never,
                rarity: "common" as never,
                quantity: 1,
                properties: {},
                value: 0,
                weight: 0,
                visibility: "visible" as never,
              },
            ],
            schedule: {},
          },
        },
      ],
    },);
    const d = await hardcodedDecision(deps(), ctx, "actor-1",);
    expect(d.turnPrompt,).toContain("Health: 42/100. Mental state: wary.",);
    expect(d.turnPrompt,).toContain("Carrying: Torch×2, Dagger.",);
  });

  test("null atmosphere omits the atmosphere fragment and tone", async () => {
    const ctx = context();
    ctx.world.currentLocation.atmosphere = null;
    const d = await hardcodedDecision(deps(), ctx, "actor-1",);
    expect(d.turnPrompt,).toContain("Location: Tavern.",);
    expect(d.turnPrompt,).not.toContain("Atmosphere:",);
    expect(d.turnConstraints.tone,).toBeUndefined();
  });

  test("active quest and previous turn are summarized", async () => {
    const ctx = context({
      activeQuests: [
        {
          id: "q1",
          name: "Find the key",
          type: QuestType.Discovery,
          progress: 1,
          target: 3,
          config: { type: "discovery", clues: [], revealOnComplete: "x", },
        },
      ],
      recentTurns: [
        {
          turnNumber: 1,
          actorId: "actor-1",
          turnType: "narrate" as never,
          prompt: "p",
          response: "I search the cellar.",
          qualityScore: null,
        },
      ],
    },);
    const d = await hardcodedDecision(deps(), ctx, "actor-1",);
    expect(d.turnPrompt,).toContain('Active quest: "Find the key" (1/3).',);
    expect(d.turnPrompt,).toContain('Previous: Hero said/did: "I search the cellar."',);
  });

  test("gm guidance constraints and scene direction are injected", async () => {
    const d = await hardcodedDecision(
      deps(
        {
          gmGuidance: { constraints: ["no violence", "stay inside",], sceneDescription: "Rain hammers the roof.", },
        } as never,
      ),
      context(),
      "actor-1",
    );
    expect(d.turnPrompt,).toContain("GM guidance — constraints: no violence; stay inside",);
    expect(d.turnPrompt,).toContain("GM scene direction: Rain hammers the roof.",);
  });

  test("llmConfig maxTokens overrides the 800 default", async () => {
    const d = await hardcodedDecision(
      deps({
        config: {
          type: "hardcoded" as never,
          llmConfig: { model: "m", provider: "p", systemPrompt: "s", temperature: 0, maxTokens: 123, },
        },
      },),
      context(),
      "actor-1",
    );
    expect(d.turnConstraints.maxTokens,).toBe(123,);
  });
});
