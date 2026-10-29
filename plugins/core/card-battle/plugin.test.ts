// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card Battle contract tests — the assistant-facing tool copy and the route
 * validators must enforce the SAME rules.
 *
 * The tool schema is the copy the assistant reads; the routes are the truth it
 * has to satisfy. A value the tool advertises but the route rejects (or the
 * other way round) breaks the contract: the assistant sends a request the API
 * cannot fulfil.
 */

import { describe, test, expect } from "bun:test";
import { plugin } from "./plugin";
import { handleStart, handlePlay, handleActions } from "./routes";
import { initBattle } from "./engine";
import type { PluginContext, ToolDefinition } from "../../../src/plugins/types";
import type { CardBattleState } from "./types";

const START_URL = "http://x/api/card-battle/start";
const PLAY_URL = "http://x/api/card-battle/play";
const ACTIONS_URL = "http://x/api/card-battle/actions";

/** The tool the plugin registers. */
function collectTool(): ToolDefinition {
  let tool: ToolDefinition | undefined;
  const ctx = {
    registerApiRoute: () => {},
    registerTool: (t: ToolDefinition) => {
      tool = t;
    },
    registerAgentRole: () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  } as unknown as PluginContext;
  void plugin.onLoad?.(ctx);
  if (!tool) throw new Error("card-battle registered no tool");
  return tool;
}

/** The values a tool property advertises. */
function advertisedEnum(tool: ToolDefinition, property: string): string[] {
  const schema = tool.parameters as { properties?: Record<string, { enum?: string[] }> };
  const entry = schema.properties?.[property];
  if (!entry?.enum) throw new Error(`tool advertises no enum for ${property}`);
  return entry.enum;
}

/** Read a JSON body from a Response. */
async function json(res: Response | null): Promise<Record<string, unknown>> {
  if (!res) throw new Error("expected Response, got null");
  return (await res.json()) as Record<string, unknown>;
}

describe("card-battle tool copy vs route truth", () => {
  test("every advertised combat action is accepted by the play route", async () => {
    const actions = advertisedEnum(collectTool(), "combatAction");
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action, state: initBattle(100, "medium", 5) }),
      }));
      expect(res!.status).toBe(200);
    }
  });

  test("an action the tool does not advertise is rejected with the advertised list", async () => {
    const tool = collectTool();
    const res = await handlePlay(new Request(PLAY_URL, {
      method: "POST",
      body: JSON.stringify({ cardIndex: 0, action: "teleport", state: initBattle(100, "medium", 5) }),
    }));
    expect(res!.status).toBe(400);
    const body = await json(res);
    for (const action of advertisedEnum(tool, "combatAction")) {
      expect(body.error).toContain(action);
    }
  });

  test("the tool and the route reject the same difficulty with the same message", async () => {
    const tool = collectTool();
    const toolResult = await tool.handler({ action: "start", difficulty: "impossible" });
    const res = await handleStart(new Request(START_URL, {
      method: "POST",
      body: JSON.stringify({ difficulty: "impossible" }),
    }));
    expect(res!.status).toBe(400);
    const body = await json(res);
    expect(toolResult.isError).toBe(true);
    expect(toolResult.content).toBe(body.error);
  });

  test("the actions endpoint lists exactly the advertised actions", async () => {
    const res = await handleActions(new Request(ACTIONS_URL, { method: "GET" }));
    const body = await json(res);
    const actions = body.actions as Array<{ id: string }>;
    expect(actions.map((a) => a.id)).toEqual(advertisedEnum(collectTool(), "combatAction"));
  });

  test("every advertised difficulty is accepted by the start route", async () => {
    const difficulties = advertisedEnum(collectTool(), "difficulty");
    expect(difficulties.length).toBeGreaterThan(0);
    for (const difficulty of difficulties) {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ difficulty }),
      }));
      expect(res!.status).toBe(200);
    }
  });

  test("a difficulty the tool does not advertise is rejected with the advertised list", async () => {
    const tool = collectTool();
    const res = await handleStart(new Request(START_URL, {
      method: "POST",
      body: JSON.stringify({ difficulty: "impossible" }),
    }));
    expect(res!.status).toBe(400);
    const body = await json(res);
    for (const difficulty of advertisedEnum(tool, "difficulty")) {
      expect(body.error).toContain(difficulty);
    }
  });

  test("the play copy names every body field the route requires", async () => {
    const tool = collectTool();
    const result = await tool.handler({ action: "play" });
    const copy = result.content;
    for (const field of ["cardIndex", "action", "state"]) {
      expect(copy).toContain(field);
    }

    const body: Record<string, unknown> = {
      cardIndex: 0,
      action: "attack",
      state: initBattle(100, "medium", 5),
    };
    for (const field of ["cardIndex", "action", "state"]) {
      const withoutField = { ...body };
      delete withoutField[field];
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify(withoutField),
      }));
      expect(res!.status).toBe(400);
    }
  });

  test("the state from /start is playable — the documented round trip works", async () => {
    const started = await json(await handleStart(new Request(START_URL, { method: "POST", body: "{}" })));
    const state = started.state as CardBattleState;

    const res = await handlePlay(new Request(PLAY_URL, {
      method: "POST",
      body: JSON.stringify({ cardIndex: 0, action: "attack", state }),
    }));
    expect(res!.status).toBe(200);
    const body = await json(res);
    const played = body.state as CardBattleState;
    // The deck travels with the client, so the round is a real round and the
    // state can be replayed for the next one.
    expect(played.deck.remaining).toBeInstanceOf(Array);
    expect(played.finished).toBe(false);
    expect(played.rounds).toHaveLength(1);
  });
});
