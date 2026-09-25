// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { createConfigSchema, } from "../config/schema-class";
import type { DB, } from "../db/schema";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { comparisonsExportRoutes, } from "./comparisons-export";
import { generationCompareRoutes, } from "./generation/compare";
import { modelComparisonsRoutes, } from "./model-comparisons";

const providerNames = ["test-compare-ok", "test-compare-fail",] as const;
const config = createConfigSchema().defaults;

function provider(label: string, fail = false,): LLMProvider {
  const complete = async (): Promise<GenerateResponse> => {
    if (fail) { throw new Error(`${label} failed`,); }
    return {
      content: `${label} response`,
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 10, totalTokens: 10, },
    };
  };
  return {
    capabilities: {
      type: "openai-compatible",
      label,
      text: true,
      image: false,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
    },
    complete,
    stream: complete,
    healthCheck: async () => ({ status: "ok", }),
    listModels: async () => [],
  };
}

function makeApp(database: Kysely<DB>, userId: string | null,) {
  return new Elysia({ name: `comparison-routes-${userId ?? "anonymous"}`, },)
    .derive(() => ({ userId, }))
    .use(generationCompareRoutes({ config, database, },),)
    .use(modelComparisonsRoutes({ database, }, "/api/v1",),)
    .use(comparisonsExportRoutes({ database, }, "/api/v1",),) as unknown as Elysia;
}

async function createRun(app: Elysia, prompt: string,): Promise<{ id: string; results: { status: string }[] }> {
  const response = await app.handle(
    new Request("http://localhost/api/v1/generation/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({
        prompt,
        models: [
          { provider: providerNames[0], model: "model-a", },
          { provider: providerNames[1], model: "model-b", },
        ],
      },),
    },),
  );
  expect(response.status,).toBe(200,);
  return await response.json() as { id: string; results: { status: string }[] };
}

describe("comparison routes", () => {
  let database: Kysely<DB>;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    database = testDb.db;
    userId = await insertUsers(database, "compare-user", "Compare User",);
    otherUserId = await insertUsers(database, "compare-other", "Other User",);
    registerProvider(providerNames[0], provider("ok",),);
    registerProvider(providerNames[1], provider("fail", true,),);
  },);

  afterAll(async () => {
    unregisterProvider(providerNames[0],);
    unregisterProvider(providerNames[1],);
    await database.destroy();
  },);

  test("persists parallel results despite one provider failure", async () => {
    const run = await createRun(makeApp(database, userId,), "persist this",);
    expect(run.id,).toBeString();
    expect(run.results.map((result,) => result.status),).toEqual(["success", "error",],);
    const row = await database.selectFrom("model_comparison_runs",).selectAll().where("id", "=", run.id,)
      .executeTakeFirstOrThrow();
    expect(row.user_id,).toBe(userId,);
    expect(row.prompt,).toBe("persist this",);
    expect(JSON.parse(row.results,),).toHaveLength(2,);
    expect(JSON.parse(row.ratings,),).toEqual({},);
    expect(JSON.parse(row.metadata,),).toMatchObject({ modelCount: 2, sweep: false, },);
  });

  test("returns bounded, owner-only history", async () => {
    const ownerApp = makeApp(database, userId,);
    const ownRun = await createRun(ownerApp, "private history",);
    const otherRun = await createRun(makeApp(database, otherUserId,), "other history",);
    const response = await ownerApp.handle(new Request("http://localhost/api/v1/comparisons?limit=500&offset=-2",),);
    expect(response.status,).toBe(200,);
    const body = await response.json() as { comparisons: { id: string }[]; limit: number; offset: number };
    expect(body.limit,).toBe(100,);
    expect(body.offset,).toBe(0,);
    expect(body.comparisons.some((comparison,) => comparison.id === ownRun.id),).toBe(true,);
    expect(body.comparisons.some((comparison,) => comparison.id === otherRun.id),).toBe(false,);
  });

  test("stores and exposes an owner-only overall rating", async () => {
    const app = makeApp(database, userId,);
    const run = await createRun(app, "rate this",);
    const request = () =>
      new Request(`http://localhost/api/v1/comparisons/${run.id}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ rating: 4, notes: "Clear winner", },),
      },);
    const response = await app.handle(request(),);
    expect(response.status,).toBe(200,);
    const body = await response.json() as { ratings: { overall?: { rating: number; notes: string } } };
    expect(body.ratings.overall,).toEqual({ rating: 4, notes: "Clear winner", },);
    expect((await makeApp(database, otherUserId,).handle(request(),)).status,).toBe(404,);
  });

  test("exports JSON and markdown with every persisted field", async () => {
    const app = makeApp(database, userId,);
    const run = await createRun(app, "export this",);
    const json = await app.handle(new Request(`http://localhost/api/v1/comparisons/${run.id}/export`,),);
    expect(json.status,).toBe(200,);
    expect(await json.json(),).toMatchObject({
      id: run.id,
      prompt: "export this",
      ratings: {},
      metadata: { modelCount: 2, },
    },);
    const markdown = await app.handle(
      new Request(`http://localhost/api/v1/comparisons/${run.id}/export?format=markdown`,),
    );
    expect(markdown.headers.get("content-type",),).toContain("text/markdown",);
    const text = await markdown.text();
    for (const section of ["# Model comparison", "## Prompt", "## Results", "## Ratings", "## Metadata",]) {
      expect(text,).toContain(section,);
    }
  });
});
