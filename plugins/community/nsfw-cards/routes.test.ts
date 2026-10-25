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
import type { PluginContext, RouteDefinition, } from "../../../src/plugins/types";
import { plugin, } from "./plugin";
import { handlePlay, handleStart, } from "./routes";

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
