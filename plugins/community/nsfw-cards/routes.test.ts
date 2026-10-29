// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests: nsfw-cards POST routes must be gated.
 *
 * BUG-nsfw-cards-ships-ungated-post-routes: both registrations shipped with
 * no requiresAuth, no permissions, and handlers that never checked identity —
 * the most permissive default. Registry gate (requiresAuth + permissions) is
 * exercised through dispatchPluginRoute; the internal defense check is
 * exercised by invoking the handlers directly with no caller.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { dispatchPluginRoute, registry, } from "../../../src/plugins/loader";
import type { PluginContext, RouteDefinition, ToolDefinition, } from "../../../src/plugins/types";
import { plugin, } from "./plugin";
import { handlePlay, handleStart, } from "./routes";
import type { SeductionRound, SeductionState, } from "./types";

/** Capture the routes the plugin registers without running real hooks. */
function collectRoutes(): RouteDefinition[] {
  const routes: RouteDefinition[] = [];
  const ctx = {
    registerApiRoute: (r: RouteDefinition,) => {
      routes.push(r,);
    },
    registerTool: () => {},
    registerAgentRole: () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, },
  } as unknown as PluginContext;
  void plugin.onLoad?.(ctx,);
  return routes;
}

const START = "http://localhost/api/nsfw-cards/start";

describe("nsfw-cards route gating", () => {
  beforeEach(() => {
    registry.register({
      manifest: { name: "nsfw-cards", version: "1", description: "d", author: "t", },
      origin: "community",
      directory: "test",
    },);
    registry.setEnabled("nsfw-cards", true,);
    registry.addRoutes("nsfw-cards", collectRoutes(),);
  },);

  afterEach(() => {
    registry.unregisterAll();
  });

  test("both registrations declare the gate (requiresAuth + nsfw permission)", () => {
    const routes = collectRoutes();
    expect(routes.length,).toBeGreaterThanOrEqual(2,);
    for (const r of routes) {
      expect(r.requiresAuth,).toBe(true,);
      expect(r.permissions,).toContain("nsfw.play",);
    }
  });

  test("anonymous POST /start is denied by the registry gate", async () => {
    const res = await dispatchPluginRoute({
      request: new Request(START, { method: "POST", body: "{}", },),
    },);
    expect(res?.status,).toBe(401,);
  });

  test("authenticated caller without the nsfw capability is forbidden", async () => {
    const res = await dispatchPluginRoute({
      request: new Request(START, { method: "POST", body: "{}", },),
      caller: { userId: "u1", userRole: "user", },
    },);
    expect(res?.status,).toBe(403,);
  });

  test("wildcard role passes the gate and reaches the handler", async () => {
    const res = await dispatchPluginRoute({
      request: new Request(START, { method: "POST", body: "{}", },),
      caller: { userId: "u1", userRole: "admin", },
    },);
    expect(res?.status,).toBe(200,);
  });

  test("internal defense: handlers reject a missing caller directly", async () => {
    const req = new Request(START, { method: "POST", body: "{}", },);
    const res = await handleStart(req,);
    expect(res?.status,).toBe(403,);

    const reqPlay = new Request("http://localhost/api/nsfw-cards/play", {
      method: "POST",
      body: JSON.stringify({ state: { difficulty: "easy", handSize: 3, }, cardIndex: 0, },),
    },);
    const resPlay = await handlePlay(reqPlay,);
    expect(resPlay?.status,).toBe(403,);
  });
});

describe("nsfw-cards input validation", () => {
  /** Capture the tool the plugin registers without running real hooks. */
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
    void plugin.onLoad?.(ctx,);
    if (!tool) throw new Error("nsfw-cards registered no tool");
    return tool;
  }

  test("the route rejects a difficulty outside the advertised set", async () => {
    const caller = { userId: "u1", userRole: "admin", };
    const res = await handleStart(
      new Request(START, { method: "POST", body: JSON.stringify({ difficulty: "impossible", }), },),
      caller,
    );
    expect(res?.status,).toBe(400,);
    const body = (await res!.json()) as { error: string };
    expect(body.error,).toBe("difficulty must be one of: easy, medium, hard",);
  });

  test("the route rejects a hand size outside 3-7", async () => {
    const caller = { userId: "u1", userRole: "admin", };
    const res = await handleStart(
      new Request(START, { method: "POST", body: JSON.stringify({ handSize: 9, }), },),
      caller,
    );
    expect(res?.status,).toBe(400,);
    const body = (await res!.json()) as { error: string };
    expect(body.error,).toBe("handSize must be 3-7",);
  });

  test("the tool rejects a card type outside the advertised set", async () => {
    const tool = collectTool();
    const result = await tool.handler({ cardType: "banana", cardPower: 3, },);
    expect(result.isError,).toBe(true,);
    expect(result.content,).toBe("cardType must be one of: flirt, charm, tease, compliment, touch, kiss",);
  });

  test("the tool rejects a card power outside 1-5", async () => {
    const tool = collectTool();
    const result = await tool.handler({ cardType: "flirt", cardPower: 9, },);
    expect(result.isError,).toBe(true,);
    expect(result.content,).toBe("Card power must be between 1 and 5.",);
  });
});

describe("nsfw-cards state round trip", () => {
  test("the state from /start can be replayed into /play", async () => {
    const caller = { userId: "u1", userRole: "admin", };
    const startRes = await handleStart(new Request(START, { method: "POST", body: "{}", },), caller,);
    expect(startRes?.status,).toBe(200,);

    const started = (await startRes!.json()) as { state: SeductionState };
    const playRes = await handlePlay(
      new Request("http://localhost/api/nsfw-cards/play", {
        method: "POST",
        body: JSON.stringify({ state: started.state, cardIndex: 0, },),
      },),
      caller,
    );
    expect(playRes?.status,).toBe(200,);
    const played = (await playRes!.json()) as { round: SeductionRound };
    expect(played.round?.card,).toBeTruthy();
  });
});
