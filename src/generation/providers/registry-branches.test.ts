// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Resolution-branch coverage for the provider registry
 * (src/generation/providers/registry.ts).
 *
 * `callWithFailover` cancellation semantics are covered by
 * registry.test.ts; here: listProviders, buildFailoverList, the
 * resolveProvider server-default/BYO paths, and initializeProviders.
 * All provider names are `sm-cov-*` unique so the shared global
 * registry is never polluted for other test files.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import { encryptValue, } from "../../crypto";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { MockLLMProvider, } from "../../test-utils/mock-provider";
import type { GenerationRoutingConfig, } from "../routing/routing-config";
import type { TaskSignal, } from "../routing/task-signal";
import {
  buildFailoverList,
  getProvider,
  initializeProviders,
  listProviders,
  registerProvider,
  resolveProvider,
  unregisterProvider,
} from "./registry";
import type { ProviderCapabilities, } from "./types";

/** Base generation config with no providers and an unresolvable default. */
function emptyConfig(): Config {
  return {
    ...loadConfig(),
    generation: {
      providers: {
        openaiCompatible: [],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: undefined,
      },
      defaultProvider: "sm-cov-unresolvable",
      defaultModels: {},
    },
  };
}

/** Register a mock under a unique name (idempotent across suite reruns). */
function registerMock(name: string,): MockLLMProvider {
  const mock = new MockLLMProvider();
  registerProvider(name, mock,);
  const registered = getProvider(name,);
  if (!registered) { throw new Error(`registration failed for ${name}`,); }
  return mock;
}

/**
 * Register a mock carrying price metadata, which is what the router ranks on.
 * `capabilities` is readonly on the mock, so it is written through a widened
 * view of the same instance — the registry keeps the real provider object.
 * @param name - unique provider name
 * @param costPer1kTokens - price the router should rank this provider by
 * @returns the registered mock
 */
function registerPriced(name: string, costPer1kTokens: number,): MockLLMProvider {
  const mock = registerMock(name,);
  const priced = mock as unknown as { capabilities: ProviderCapabilities };
  priced.capabilities = { ...mock.capabilities, costPer1kTokens, };
  return mock;
}

/**
 * Config carrying a routing policy, with `names` as the configured secondaries
 * (the primary is passed separately, so it never appears in this list).
 * @param strategy - the ordering policy under test
 * @param names - configured secondary provider instances
 * @returns a config whose `generation.routing` is set
 */
function routingConfig(
  strategy: GenerationRoutingConfig["strategy"],
  names: string[],
): Config {
  const config = emptyConfig();
  config.generation.routing = { strategy, };
  config.generation.providers.openaiCompatible = names.map((name,) => ({
    name,
    label: name,
    baseUrl: "http://localhost:8080/v1",
    model: "m",
    timeout: 1000,
    retries: 0,
    allowUserApiKey: false,
    models: {},
  }));
  return config;
}

/** A chat turn signal — the production shape a generate dispatch carries. */
const TURN: TaskSignal = { taskType: "interactive-turn", };
let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  try {
    createLogger({ level: "error", },);
  } catch {
    // Logger already initialized by another test file — reuse it.
  }

  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

afterAll(() => {
  for (
    const name of [
      "sm-cov-list-a",
      "sm-cov-list-b",
      "sm-cov-fail-a",
      "sm-cov-fail-b",
      "sm-cov-fail-c",
      "sm-cov-res-a",
      "sm-cov-res-fb",
      "sm-cov-byo-a",
      "sm-cov-byo-b",
      "sm-cov-init-a",
      "sm-cov-route-a",
      "sm-cov-route-b",
      "sm-cov-route-c",
      "sm-cov-rr-a",
      "sm-cov-rr-b",
      "sm-cov-rr-c",
      "sm-cov-noop-a",
      "sm-cov-noop-b",
    ]
  ) { unregisterProvider(name,); }
  testSqlite.close();
},);

describe("listProviders / registerProvider", () => {
  test("lists a uniquely registered provider with its capabilities", () => {
    registerMock("sm-cov-list-a",);
    const entries = listProviders();
    const found = entries.find((e,) => e.name === "sm-cov-list-a");
    expect(found,).toBeDefined();
    expect(found?.capabilities.text,).toBe(true,);
  });

  test("re-registering a name keeps the original entry", () => {
    const first = registerMock("sm-cov-list-b",);
    registerProvider("sm-cov-list-b", new MockLLMProvider(),);
    expect(getProvider("sm-cov-list-b",),).toBe(first,);
  });

  test("returns undefined for unknown provider names", () => {
    expect(getProvider("sm-cov-no-such-provider",),).toBeUndefined();
  });
});

describe("buildFailoverList", () => {
  test("returns empty for an unregistered primary", () => {
    expect(buildFailoverList("sm-cov-no-such-provider",),).toEqual([],);
  });

  test("returns just the primary when no config is given", () => {
    registerMock("sm-cov-fail-a",);
    const list = buildFailoverList("sm-cov-fail-a",);
    expect(list.map((e,) => e.name),).toEqual(["sm-cov-fail-a",],);
  });

  // BUG: a partial Config (tests build stubs; `callAux` forwards whatever it
  // was handed) must degrade to the primary-only list. Dereferencing
  // `config.generation.providers` unguarded threw a TypeError that aborted
  // the dispatch and was swallowed by the caller's catch, turning a working
  // memory extraction into a silent empty result.
  test("degrades to primary-only for a partial config with no providers block", () => {
    registerMock("sm-cov-partial",);
    const partial = { generation: {}, } as unknown as Config;
    expect(() => buildFailoverList("sm-cov-partial", partial,)).not.toThrow();
    expect(buildFailoverList("sm-cov-partial", partial,).map((e,) => e.name),).toEqual(["sm-cov-partial",],);
  });

  test("degrades to primary-only when generation is absent entirely", () => {
    registerMock("sm-cov-no-gen",);
    const partial = {} as Config;
    expect(buildFailoverList("sm-cov-no-gen", partial,).map((e,) => e.name),).toEqual(["sm-cov-no-gen",],);
  });

  test("routes without throwing when a signal accompanies a partial config", () => {
    registerMock("sm-cov-sig",);
    const partial = { generation: { providers: {}, }, } as unknown as Config;
    const list = buildFailoverList("sm-cov-sig", partial, { taskType: "interactive-turn", },);
    expect(list.map((e,) => e.name),).toEqual(["sm-cov-sig",],);
  });

  test("adds only registered secondaries from config", () => {
    registerMock("sm-cov-fail-b",);
    registerMock("sm-cov-fail-c",);
    const config = emptyConfig();
    config.generation.providers.openaiCompatible = [
      {
        name: "sm-cov-fail-c",
        label: "C",
        baseUrl: "http://localhost:8080/v1",
        model: "m",
        timeout: 1000,
        retries: 0,
        allowUserApiKey: false,
        models: {},
      },
      {
        name: "sm-cov-never-registered",
        label: "X",
        baseUrl: "http://localhost:8080/v1",
        model: "m",
        timeout: 1000,
        retries: 0,
        allowUserApiKey: false,
        models: {},
      },
    ];
    const list = buildFailoverList("sm-cov-fail-b", config,);
    expect(list.map((e,) => e.name),).toEqual(["sm-cov-fail-b", "sm-cov-fail-c",],);
  });

  /**
   * BUG: the old tail was `[result[0], ...routed.fallbacks]` — the caller's
   * primary plus the router's chain. With A primary, B and C configured and C
   * cheapest, the router returned `{ primary: C, fallbacks: [B, A] }` and this
   * function emitted `[A, B, A]`: C was never attempted and A was retried,
   * burning a second timeout and a second `circuitBreaker.onFailure`.
   */
  test("emits the router's whole order, with the cheapest provider exactly once", () => {
    registerPriced("sm-cov-route-a", 0.03,);
    registerPriced("sm-cov-route-b", 0.02,);
    registerPriced("sm-cov-route-c", 0.01,);
    const config = routingConfig("cheapest", ["sm-cov-route-b", "sm-cov-route-c",],);
    const names = buildFailoverList("sm-cov-route-a", config, TURN,).map((e,) => e.name);
    expect(names,).toEqual(["sm-cov-route-c", "sm-cov-route-b", "sm-cov-route-a",],);
    expect(new Set(names,).size,).toBe(3,);
  });

  /**
   * BUG: `buildFailoverList` built `new ModelRouter(...)` per call, so the
   * round-robin cursor was always 0 and the strategy never rotated outside a
   * test that reused one instance. Driven through the production entry point so
   * the regression cannot hide behind a hand-built router again.
   */
  test("round-robin rotates the primary across sequential dispatches", () => {
    registerPriced("sm-cov-rr-a", 0.01,);
    registerPriced("sm-cov-rr-b", 0.01,);
    registerPriced("sm-cov-rr-c", 0.01,);
    const config = routingConfig("round-robin", ["sm-cov-rr-b", "sm-cov-rr-c",],);
    const primaries = [0, 1, 2, 0,].map(() => buildFailoverList("sm-cov-rr-a", config, TURN,)[0]!.name);
    expect(primaries,).toEqual(["sm-cov-rr-a", "sm-cov-rr-b", "sm-cov-rr-c", "sm-cov-rr-a",],);
  });

  /**
   * The shipped default (`capability-match`, no rules, no cap) is the
   * pre-routing behaviour. Running the router on it would drop a fallback that
   * declares a required capability `false` — an eligibility change no caller
   * ever asked for.
   */
  test("the default policy leaves the config order untouched, ineligible fallbacks included", () => {
    registerPriced("sm-cov-noop-a", 0.01,);
    const fallback = registerPriced("sm-cov-noop-b", 0.02,);
    const noTools = fallback as unknown as { capabilities: ProviderCapabilities };
    noTools.capabilities = { ...fallback.capabilities, tools: false, };
    const config = routingConfig("capability-match", ["sm-cov-noop-b",],);
    const names = buildFailoverList("sm-cov-noop-a", config, {
      ...TURN,
      requiresCapabilities: ["tools",],
    },).map((e,) => e.name);
    expect(names,).toEqual(["sm-cov-noop-a", "sm-cov-noop-b",],);
  });
});

describe("resolveProvider", () => {
  test("resolves an explicit provider and model without a BYO key", async () => {
    registerMock("sm-cov-res-a",);
    const resolved = await resolveProvider({
      provider: "sm-cov-res-a",
      model: "model-1",
      config: emptyConfig(),
    },);

    expect(resolved.resolvedProviderName,).toBe("sm-cov-res-a",);
    expect(resolved.resolvedModel,).toBe("model-1",);
    expect(resolved.resolvedApiKey,).toBeUndefined();
    expect(resolved.provider,).toBe(getProvider("sm-cov-res-a",)!,);
  });

  test("falls back to the first configured instance when no default is set", async () => {
    registerMock("sm-cov-res-fb",);
    const config = emptyConfig();
    config.generation.defaultProvider = "";
    config.generation.providers.openaiCompatible = [
      {
        name: "sm-cov-res-fb",
        label: "FB",
        baseUrl: "http://localhost:8080/v1",
        model: "fb-model",
        timeout: 1000,
        retries: 0,
        allowUserApiKey: false,
        models: {},
      },
    ];

    config.generation.defaultModels = { "sm-cov-res-fb": "fb-model", };
    const resolved = await resolveProvider({ config, },);
    expect(resolved.resolvedProviderName,).toBe("sm-cov-res-fb",);
    expect(resolved.resolvedModel,).toBe("fb-model",);
  });

  test("throws for a provider that is not registered", async () => {
    await expect(resolveProvider({
      provider: "sm-cov-no-such-provider",
      model: "m",
      config: emptyConfig(),
    },),).rejects.toThrow("No provider resolved",);
  });

  test("prefers the user BYO key when decryption succeeds", async () => {
    registerMock("sm-cov-byo-a",);
    const secret = "sm-cov-test-secret-key";
    await testDb.insertInto("users",).values({
      id: "byo-user",
      username: "byo-user",
      display_name: "BYO User",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    await testDb.insertInto("user_api_keys",).values({
      user_id: "byo-user",
      provider_name: "sm-cov-byo-a",
      api_key_encrypted: await encryptValue("sk-byo-secret", secret,),
    },).execute();

    const config = emptyConfig();
    config.byoKey = { enabled: true, encryptionKey: secret, } as Config["byoKey"];
    const resolved = await resolveProvider({
      provider: "sm-cov-byo-a",
      model: "m",
      userId: "byo-user",
      config,
      db: testDb,
    },);

    expect(resolved.resolvedApiKey,).toBe("sk-byo-secret",);
  });

  test("falls back to the server key when BYO decryption fails", async () => {
    registerMock("sm-cov-byo-b",);
    const secret = "sm-cov-test-secret-key";
    await testDb.insertInto("users",).values({
      id: "byo-user-broken",
      username: "byo-user-broken",
      display_name: "Broken BYO",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    await testDb.insertInto("user_api_keys",).values({
      user_id: "byo-user-broken",
      provider_name: "sm-cov-byo-b",
      api_key_encrypted: "not-valid-ciphertext",
    },).execute();

    const config = emptyConfig();
    config.byoKey = { enabled: true, encryptionKey: secret, } as Config["byoKey"];
    const resolved = await resolveProvider({
      provider: "sm-cov-byo-b",
      model: "m",
      userId: "byo-user-broken",
      config,
      db: testDb,
    },);

    expect(resolved.resolvedProviderName,).toBe("sm-cov-byo-b",);
    expect(resolved.resolvedApiKey,).toBeUndefined();
  });
});

describe("initializeProviders", () => {
  test("registers configured instances and skips repeats", () => {
    const config = emptyConfig();
    config.generation.providers.openaiCompatible = [
      {
        name: "sm-cov-init-a",
        label: "Init A",
        baseUrl: "http://localhost:8080/v1",
        model: "init-model",
        timeout: 1000,
        retries: 0,
        allowUserApiKey: false,
        models: {},
      },
    ];

    expect(getProvider("sm-cov-init-a",),).toBeUndefined();
    initializeProviders(config,);
    expect(getProvider("sm-cov-init-a",),).toBeDefined();
    // Second run takes the already-registered fast path.
    initializeProviders(config,);
    expect(getProvider("sm-cov-init-a",),).toBeDefined();
  });
});
