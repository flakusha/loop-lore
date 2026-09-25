/**
 * Tests for FEAT-060 model comparison A/B route.
 * Verifies parallel generation, Promise.allSettled semantics, latency
 * capture, cost calculation, sweep detection, and validation.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  registerProvider,
  unregisterProvider,
} from "../../generation/providers/registry";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { MockLLMProvider, } from "../../test-utils/mock-provider";
import { uid, } from "../../utils";
import { generationCompareRoutes, } from "./compare";

const mockConfig = {
  generation: {
    defaultProvider: "",
    defaultModels: {} as Record<string, string>,
    providers: { openaiCompatible: [], },
  },
  byoKey: { enabled: false, },
} as never;

function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-generation-compare", },)
    .derive(() => ({ userId, }))
    .use(generationCompareRoutes({ config: mockConfig, database: db, },),) as unknown as Elysia;
}

describe("generationCompareRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: import("bun:sqlite").Database;
  let p1: MockLLMProvider;
  let p2: MockLLMProvider;
  let p3: MockLLMProvider;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    p1 = new MockLLMProvider();
    p2 = new MockLLMProvider();
    p3 = new MockLLMProvider();
    p3.failOnCall = true;
    registerProvider("p1", p1,);
    registerProvider("p2", p2,);
    registerProvider("p3", p3,);
  },);

  afterAll(async () => {
    unregisterProvider("p1",);
    unregisterProvider("p2",);
    unregisterProvider("p3",);
    await db.destroy();
    sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ prompt: "hi", models: [{ provider: "p1", model: "m1", },], },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("rejects empty models array with 400", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ prompt: "hi", models: [], },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("rejects missing prompt with 400", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ models: [{ provider: "p1", model: "m1", },], },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("runs two providers in parallel and returns results in input order", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          prompt: "test",
          models: [{ provider: "p1", model: "m1", }, { provider: "p2", model: "m2", },],
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      id: string;
      sweep: boolean;
      results: Array<
        {
          model: { provider: string; name: string };
          status: string;
          latencyMs: number;
          tokenCount: number;
          cost: number;
        }
      >;
    };
    expect(typeof body.id,).toBe("string",);
    expect(body.results.length,).toBe(2,);
    expect(body.results[0]!.model.provider,).toBe("p1",);
    expect(body.results[0]!.model.name,).toBe("m1",);
    expect(body.results[1]!.model.provider,).toBe("p2",);
    expect(body.results[0]!.status,).toBe("success",);
    expect(body.results[1]!.status,).toBe("success",);
    expect(body.sweep,).toBe(false,);
  });

  test("captures latency and computes cost from totalTokens", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          prompt: "test",
          models: [{ provider: "p1", model: "m1", },],
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      results: Array<{ latencyMs: number; tokenCount: number; cost: number }>;
    };
    expect(body.results[0]!.latencyMs,).toBeGreaterThanOrEqual(0,);
    expect(body.results[0]!.tokenCount,).toBe(30,);
    // cost = 30 / 1000 * 0.002 rounded to cents = 0.00
    expect(body.results[0]!.cost,).toBe(0.00,);
  });

  test("Promise.allSettled: one failing provider does not block others", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          prompt: "test",
          models: [
            { provider: "p1", model: "m1", },
            { provider: "p3", model: "m3", },
            { provider: "p2", model: "m2", },
          ],
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      results: Array<{ status: string; error?: string }>;
    };
    expect(body.results.length,).toBe(3,);
    expect(body.results[0]!.status,).toBe("success",);
    expect(body.results[1]!.status,).toBe("error",);
    expect(body.results[1]!.error,).toContain("Mock provider failure",);
    expect(body.results[2]!.status,).toBe("success",);
  });

  test("detects parameter sweep when same provider+model is used", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          prompt: "sweep test",
          models: [
            { provider: "p1", model: "m1", temperature: 0.2, },
            { provider: "p1", model: "m1", temperature: 0.8, },
          ],
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      sweep: boolean;
      results: Array<{ metadata: { kind: string } }>;
    };
    expect(body.sweep,).toBe(true,);
    expect(body.results[0]!.metadata.kind,).toBe("sweep",);
    expect(body.results[1]!.metadata.kind,).toBe("sweep",);
  });

  test("persists the run to model_comparison_runs with id and createdAt", async () => {
    const userId = uid();
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/v1/generation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          prompt: "persist me",
          models: [{ provider: "p1", model: "m1", },],
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { id: string; createdAt: string };
    const row = await db
      .selectFrom("model_comparison_runs",)
      .selectAll()
      .where("id", "=", body.id,)
      .executeTakeFirst();
    expect(row,).toBeDefined();
    expect(row!.user_id,).toBe(userId,);
    expect(row!.prompt,).toBe("persist me",);
    expect(row!.created_at,).toBe(body.createdAt,);
  });
});
