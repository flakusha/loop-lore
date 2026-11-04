// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Route tests for the harness model discovery surface: the admin guard
 * denies non-admins, an uncomposed runtime reads 503 (inert when the
 * integration is disabled), and the listing merges live harness-source
 * entries with static fallbacks, enriched from the capability table.
 *
 * Resource contract (parallel-safe): the runtime is the per-test composed
 * singleton, reset in beforeEach AND afterEach via resetHarnessRuntime;
 * the DB is the per-file in-memory fixture (createTestDb/destroyTestDb);
 * fake adapters are in-memory. No ports, no sleeps, no fixed paths —
 * order-independent under the parallel runner.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { upsertModelCapabilities, } from "../../admin/model-capabilities";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { fakeFactory, } from "../../integrations/harness/fakes";
import { getHarnessRuntime, initHarnessRuntime, resetHarnessRuntime, } from "../../integrations/harness/runtime";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { harnessModelRoutes, } from "./models";

let fixture: TestDb;

beforeAll(async () => {
  fixture = await createTestDb();
},);

afterAll(async () => {
  await destroyTestDb(fixture,);
},);

beforeEach(() => {
  resetHarnessRuntime();
},);

afterEach(() => {
  resetHarnessRuntime();
},);

/** Mount the routes on a fresh app with a fixed role. */
function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(harnessModelRoutes({ database: fixture.db, },),);

  return built as unknown as Elysia;
}

/** Hit a path on a fresh mounted app. */
function hit(role: string | null, path: string,): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost${path}`,),);
}

const LIVE: AcpProfileConfig = {
  name: "p",
  command: ["fake", "p",],
  tiers: { fast: { model: "zai/glm-4.6", capabilities: ["tools",], }, },
};

const IDLE: AcpProfileConfig = {
  name: "q",
  command: ["fake", "q",],
  harness: "opencode",
  tiers: { fast: { model: "q/fast", capabilities: ["tools",], }, },
};

/** Compose a runtime with one probed live profile and one idle profile. */
async function composeRuntime(): Promise<void> {
  const { factory, } = fakeFactory({ p: { models: ["zai/glm-4.6",], }, },);
  initHarnessRuntime({ enabled: true, profiles: [LIVE, IDLE,], }, factory,);
  await getHarnessRuntime()?.registry.ensureProbed("p",);
}

describe("harnessModelRoutes", () => {
  it("denies a non-admin", async () => {
    await composeRuntime();

    const res = await hit("member", "/api/v1/harness/models",);
    expect(res.status,).toBe(403,);
  });

  it("reads 503 when the runtime is not composed", async () => {
    const res = await hit("admin", "/api/v1/harness/models",);
    expect(res.status,).toBe(503,);
  });

  it("a disabled config composes no runtime, so the surface stays inert", async () => {
    initHarnessRuntime({ enabled: false, profiles: [], },);

    const res = await hit("admin", "/api/v1/harness/models",);
    expect(res.status,).toBe(503,);
  });

  it("lists live entries first, then the idle profile's static fallback", async () => {
    await composeRuntime();

    const res = await hit("admin", "/api/v1/harness/models",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { items: Array<Record<string, unknown>> };
    expect(body.items,).toEqual([
      { source: "harness", profile: "p", harness: "omp", model: "zai/glm-4.6", capabilities: null, },
      {
        source: "static",
        profile: "q",
        harness: "opencode",
        model: "q/fast",
        reason: "no live connection — reported from static profile config",
        capabilities: null,
      },
    ],);
  });

  it("enriches entries the capability table knows", async () => {
    await upsertModelCapabilities(fixture.db, "zai", [
      { id: "glm-4.6", contextWindow: 131072, modalities: ["text",], toolCalling: true, },
    ],);

    await composeRuntime();

    const res = await hit("admin", "/api/v1/harness/models",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { items: Array<{ model: string; capabilities: Record<string, unknown> | null }> };
    expect(body.items[0]?.model,).toBe("zai/glm-4.6",);
    expect(body.items[0]?.capabilities,).toEqual({
      contextWindow: 131072,
      maxOutput: null,
      supportsTools: true,
      supportsVision: false,
      supportsThinking: false,
      modalities: ["text",],
    },);

    expect(body.items[1]?.capabilities,).toBeNull();
  });

  it("an empty profile list yields an empty item set", async () => {
    const { factory, } = fakeFactory({},);
    initHarnessRuntime({ enabled: true, profiles: [], }, factory,);

    const res = await hit("admin", "/api/v1/harness/models",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { items: unknown[] };
    expect(body.items,).toEqual([],);
  });
});
