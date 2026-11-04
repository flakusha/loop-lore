// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Unit tests for harness model discovery + capability enrichment
 * (TASK-model-discovery-capability-enrichment): live profiles report
 * harness-source ids, unprobed/failed profiles degrade to static config,
 * one profile's failure never affects the others, and enrichment merges
 * the static capability table by the `provider/id` prefix — read-only.
 *
 * Resource contract (parallel-safe): the runtime is the per-test composed
 * singleton, reset in beforeEach AND afterEach via resetHarnessRuntime;
 * the DB is a per-file in-memory fixture (createTestDb/destroyTestDb); the
 * adapters are in-memory fakes. No ports, no sleeps, no fixed paths —
 * order-independent under the parallel runner.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { upsertModelCapabilities, } from "../../admin/model-capabilities";
import { type AcpProfileConfig, } from "../../config/schema/harness";
import { ModelRouter, type RoutableModel, } from "../../generation/routing/router";
import { INTERACTIVE_TURN, } from "../../generation/routing/task-signal";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import type { HarnessAcpAdapter, HarnessAdapterFactory, } from "./adapter-types";
import { HarnessAcpError, } from "./adapter-types";
import { fakeAdapter, fakeFactory, } from "./fakes";
import {
  discoverHarnessModels,
  type HarnessModelEntry,
  NO_LIVE_CONNECTION_REASON,
  staticHarnessModels,
  toRoutableCandidates,
} from "./model-discovery";
import { getHarnessRuntime, initHarnessRuntime, resetHarnessRuntime, } from "./runtime";

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

const LIVE: AcpProfileConfig = {
  name: "p",
  command: ["fake", "p",],
  tiers: { fast: { model: "zai/glm-4.6", capabilities: ["tools",], }, },
};

const IDLE: AcpProfileConfig = {
  name: "q",
  command: ["fake", "q",],
  harness: "opencode",
  tiers: {
    good: { model: "q/good", capabilities: ["thinking",], },
    fast: { model: "q/fast", capabilities: ["tools",], },
  },
};

const BROKEN: AcpProfileConfig = {
  name: "r",
  command: ["fake", "r",],
  tiers: { fast: { model: "r/fast", capabilities: ["tools",], }, },
};

/**
 * An adapter whose listing succeeds exactly once (the probe) and rejects
 * afterwards — a live connection whose enumerateModels surface broke.
 */
function listingBreaksAfterProbe(models: string[],): HarnessAcpAdapter {
  const base = fakeAdapter({ models, },).adapter;
  let listings = 0;
  return {
    ...base,
    enumerateModels: () => {
      listings += 1;
      if (listings > 1) {
        return Promise.reject(new HarnessAcpError("model", "listing boom",),);
      }

      return base.enumerateModels();
    },
  };
}

/** Compose a runtime over the given profiles with the given factory and probe a subset. */
async function compose(options: {
  profiles: AcpProfileConfig[];
  factory: HarnessAdapterFactory;
  probe: string[];
},): Promise<void> {
  initHarnessRuntime({ enabled: true, profiles: options.profiles, }, options.factory,);
  for (const name of options.probe) {
    await getHarnessRuntime()?.registry.ensureProbed(name,);
  }
}

describe("discoverHarnessModels", () => {
  it("a live profile reports harness-source ids, deduplicated", async () => {
    const { factory, } = fakeFactory({ p: { models: ["zai/glm-4.6", "zai/glm-4.6", "other/x",], }, },);
    await compose({ profiles: [LIVE,], factory, probe: ["p",], },);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);
    expect(result,).toHaveLength(1,);
    expect(result[0]?.profile,).toBe("p",);
    expect(result[0]?.harness,).toBe("omp",);
    expect(result[0]?.models,).toEqual([
      { source: "harness", profile: "p", harness: "omp", model: "zai/glm-4.6", capabilities: null, },
      { source: "harness", profile: "p", harness: "omp", model: "other/x", capabilities: null, },
    ],);
  });

  it("a profile without a live connection reports its static tier config", async () => {
    const { factory, } = fakeFactory({ p: { models: ["zai/glm-4.6",], }, },);
    await compose({ profiles: [LIVE, IDLE,], factory, probe: ["p",], },);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);
    expect(result,).toHaveLength(2,);
    expect(result[1]?.profile,).toBe("q",);
    expect(result[1]?.harness,).toBe("opencode",);
    expect(result[1]?.models,).toEqual([
      {
        source: "static",
        profile: "q",
        harness: "opencode",
        model: "q/good",
        reason: NO_LIVE_CONNECTION_REASON,
        capabilities: null,
      },
      {
        source: "static",
        profile: "q",
        harness: "opencode",
        model: "q/fast",
        reason: NO_LIVE_CONNECTION_REASON,
        capabilities: null,
      },
    ],);
  });

  it("a failed listing on a live connection degrades that profile to static", async () => {
    const factory = (): Promise<HarnessAcpAdapter> => Promise.resolve(listingBreaksAfterProbe(["zai/glm-4.6",],),);
    await compose({ profiles: [LIVE,], factory, probe: ["p",], },);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);
    expect(result[0]?.models,).toEqual([
      {
        source: "static",
        profile: "p",
        harness: "omp",
        model: "zai/glm-4.6",
        reason: "listing boom",
        capabilities: null,
      },
    ],);
  });

  it("one profile's probe failure leaves the other profiles unaffected", async () => {
    const { factory, } = fakeFactory({ p: { models: ["zai/glm-4.6",], }, r: { models: [], failProbe: true, }, },);
    await compose({ profiles: [LIVE, BROKEN,], factory, probe: ["p", "r",], },);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);
    expect(result[0]?.models,).toEqual([
      { source: "harness", profile: "p", harness: "omp", model: "zai/glm-4.6", capabilities: null, },
    ],);

    expect(result[1]?.models,).toEqual([
      {
        source: "static",
        profile: "r",
        harness: "omp",
        model: "r/fast",
        reason: NO_LIVE_CONNECTION_REASON,
        capabilities: null,
      },
    ],);
  });

  it("enrichment merges the static capability table by the provider/id prefix", async () => {
    await upsertModelCapabilities(fixture.db, "zai", [
      {
        id: "glm-4.6",
        contextWindow: 131072,
        maxOutput: 16384,
        modalities: ["text", "image",],
        toolCalling: true,
        thinking: true,
      },
    ],);

    const { factory, } = fakeFactory({ p: { models: ["zai/glm-4.6",], }, },);
    await compose({ profiles: [LIVE,], factory, probe: ["p",], },);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);
    expect(result[0]?.models[0]?.capabilities,).toEqual({
      contextWindow: 131072,
      maxOutput: 16384,
      supportsTools: true,
      supportsVision: true,
      supportsThinking: true,
      modalities: ["text", "image",],
    },);
  });

  it("a prefix-less model id keys enrichment on the profile's flavor", async () => {
    await upsertModelCapabilities(fixture.db, "omp", [
      { id: "bare", contextWindow: 8192, modalities: ["text",], toolCalling: false, },
    ],);

    const { factory, } = fakeFactory({ p: { models: ["bare",], }, },);
    await compose({ profiles: [LIVE,], factory, probe: ["p",], },);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);
    expect(result[0]?.models[0]?.capabilities,).toEqual({
      contextWindow: 8192,
      maxOutput: null,
      supportsTools: false,
      supportsVision: false,
      supportsThinking: false,
      modalities: ["text",],
    },);
  });

  it("a model the capability table does not know enriches to null", async () => {
    const { factory, } = fakeFactory({ p: { models: ["unknown/model",], }, },);
    await compose({ profiles: [LIVE,], factory, probe: ["p",], },);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);
    expect(result[0]?.models[0]?.capabilities,).toBeNull();
  });

  it("discovery never spawns: an unprobed runtime reports static config for every profile", async () => {
    const spawned: string[] = [];
    const factory: HarnessAdapterFactory = (profile,) => {
      spawned.push(profile,);
      return Promise.reject(new HarnessAcpError("spawn", "must never be called",),);
    };

    initHarnessRuntime({ enabled: true, profiles: [LIVE, IDLE,], }, factory,);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);
    expect(spawned,).toEqual([],);
    expect(result.every((profile,) => profile.models.every((model,) => model.source === "static")),).toBe(true,);
  });
});

describe("staticHarnessModels", () => {
  it("an unknown profile yields no entries", () => {
    expect(staticHarnessModels({ profile: undefined, name: "ghost", reason: "any", },),).toEqual([],);
  });

  it("deduplicates tier models that share an id", () => {
    const shared: AcpProfileConfig = {
      name: "s",
      command: ["fake", "s",],
      tiers: { good: { model: "same/id", capabilities: [], }, fast: { model: "same/id", capabilities: [], }, },
    };

    const entries = staticHarnessModels({ profile: shared, name: "s", reason: "any", },);
    expect(entries,).toHaveLength(1,);
    expect(entries[0]?.model,).toBe("same/id",);
  });
});

describe("toRoutableCandidates", () => {
  it("projects enriched entries onto the shared router's candidate shape", () => {
    const entries: HarnessModelEntry[] = [
      {
        source: "harness",
        profile: "p",
        harness: "omp",
        model: "zai/glm-4.6",
        capabilities: {
          contextWindow: 131072,
          maxOutput: 16384,
          supportsTools: true,
          supportsVision: true,
          supportsThinking: true,
          modalities: ["text", "image",],
        },
      },
      {
        source: "static",
        profile: "q",
        harness: "opencode",
        model: "q/fast",
        reason: NO_LIVE_CONNECTION_REASON,
        capabilities: null,
      },
    ];

    const candidates: RoutableModel[] = toRoutableCandidates(entries,);
    expect(candidates[0],).toEqual({
      name: "p",
      model: "zai/glm-4.6",
      capabilities: { tools: true, thinking: true, text: true, image: true, },
      contextWindow: 131072,
      maxOutputTokens: 16384,
    },);

    expect(candidates[1],).toEqual({ name: "q", model: "q/fast", capabilities: {}, },);
  });

  it("feeds ModelRouter.route: an explicit tools=false candidate is filtered out", () => {
    const entries: HarnessModelEntry[] = [
      {
        source: "harness",
        profile: "p",
        harness: "omp",
        model: "plain/model",
        capabilities: {
          contextWindow: 8192,
          maxOutput: null,
          supportsTools: false,
          supportsVision: false,
          supportsThinking: false,
          modalities: ["text",],
        },
      },
      {
        source: "harness",
        profile: "p",
        harness: "omp",
        model: "zai/glm-4.6",
        capabilities: {
          contextWindow: 131072,
          maxOutput: null,
          supportsTools: true,
          supportsVision: false,
          supportsThinking: false,
          modalities: ["text",],
        },
      },
    ];

    const router = new ModelRouter();
    const routed = router.route(
      { ...INTERACTIVE_TURN, requiresCapabilities: ["tools",], },
      toRoutableCandidates(entries,),
    );

    expect(routed.primary?.model,).toBe("zai/glm-4.6",);
    expect(routed.fallbacks,).toEqual([],);
  });
});
