// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trivia contract tests — the assistant-facing tool copy and the route
 * validators must enforce the SAME rules.
 *
 * The tool schema is the copy the assistant reads; the routes are the truth it
 * has to satisfy. A value the tool advertises but the route rejects (or the
 * other way round) breaks the contract: the assistant sends a request the API
 * cannot fulfil.
 */

import { describe, test, expect } from "bun:test";
import { plugin } from "./plugin";
import { handleStart, handleAnswer, handleCategories } from "./routes";
import type { PluginContext, ToolDefinition } from "../../../src/plugins/types";

const START_URL = "http://x/api/trivia/start";
const ANSWER_URL = "http://x/api/trivia/answer";
const CATEGORIES_URL = "http://x/api/trivia/categories";

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
  if (!tool) throw new Error("trivia registered no tool");
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

describe("trivia tool copy vs route truth", () => {
  test("every advertised category is accepted by the start route", async () => {
    const categories = advertisedEnum(collectTool(), "category");
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ category }),
      }));
      expect(res!.status).toBe(200);
    }
  });

  test("a category the tool does not advertise is rejected with the advertised list", async () => {
    const tool = collectTool();
    const res = await handleStart(new Request(START_URL, {
      method: "POST",
      body: JSON.stringify({ category: "sports" }),
    }));
    expect(res!.status).toBe(400);
    const body = await json(res);
    for (const category of advertisedEnum(tool, "category")) {
      expect(body.error).toContain(category);
    }
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

  test("the tool and the route reject the same category with the same message", async () => {
    const tool = collectTool();
    const toolResult = await tool.handler({ action: "start", category: "sports" });
    const res = await handleStart(new Request(START_URL, {
      method: "POST",
      body: JSON.stringify({ category: "sports" }),
    }));
    expect(res!.status).toBe(400);
    const body = await json(res);
    expect(toolResult.isError).toBe(true);
    expect(toolResult.content).toBe(body.error);
  });

  test("the categories endpoint lists exactly the advertised categories and difficulties", async () => {
    const tool = collectTool();
    const body = await json(await handleCategories(new Request(CATEGORIES_URL, { method: "GET" })));
    const categories = body.categories as Array<{ id: string }>;
    expect(categories.map((c) => c.id)).toEqual(advertisedEnum(tool, "category"));
    expect(body.difficulties).toEqual(advertisedEnum(tool, "difficulty"));
  });

  test("the categories copy names every advertised category", async () => {
    const tool = collectTool();
    const result = await tool.handler({ action: "categories" });
    for (const category of advertisedEnum(tool, "category")) {
      expect(result.content).toContain(category);
    }
  });

  test("the answer copy names every body field the route requires", async () => {
    const tool = collectTool();
    const result = await tool.handler({ action: "answer" });
    expect(result.content).toContain("sessionId");
    expect(result.content).toContain("answerIndex");

    const missingIndex = await handleAnswer(new Request(ANSWER_URL, {
      method: "POST",
      body: JSON.stringify({ sessionId: "no-such-session" }),
    }));
    expect(missingIndex!.status).toBe(400);

    const missingSession = await handleAnswer(new Request(ANSWER_URL, {
      method: "POST",
      body: JSON.stringify({ answerIndex: 0 }),
    }));
    expect(missingSession!.status).toBe(400);
  });
});
