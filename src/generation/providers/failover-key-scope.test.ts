// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Failover credential scoping
 * (BUG-failover-replays-primary-byo-key-to-fallback-vendors).
 *
 * A user's BYO key is stored per provider. When the primary fails and the
 * chain moves to another vendor, that attempt must resolve ITS OWN key — the
 * primary's key must never reach a third-party endpoint.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import { encryptValue, } from "../../crypto";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, } from "../../test-utils/create-test-db";
import { callWithFailover, } from "./call-with-failover";
import { buildFailoverList, registerProvider, resolveProvider, unregisterProvider, } from "./registry";
import type { GenerateRequest, LLMProvider, } from "./types";

// Bun's mock.module is process-global: an earlier file may have replaced
// callWithFailover. Probe for the real module — only the genuine one throws
// "All providers failed" on an empty list (same guard as registry.test.ts).
let modulePristine = false;
try {
  await callWithFailover([], { model: "m", messages: [], params: {}, },);
} catch (error) {
  modulePristine = error instanceof Error && error.message.startsWith("All providers failed",);
}

const describeReal: (name: string, fn: () => void,) => void = modulePristine
  ? describe
  : (name, fn,) => describe.skip(name, fn,);

const SECRET = "fks-encryption-key";
const PRIMARY = "fks-vendor-a";
const FALLBACK = "fks-vendor-b";
const USER_ID = "fks-user";

/**
 * Install the recording doubles for one chain. registerProvider is
 * first-wins, so a re-registered name would keep the previous test's
 * recorder — drop any leftover first.
 */
function installChain(
  seen: Record<string, (string | undefined)[]>,
  primary: string,
  fallback: string,
): void {
  unregisterProvider(primary,);
  unregisterProvider(fallback,);
  registerProvider(
    primary,
    recordingProvider((key,) => {
      seen[primary]!.push(key,);
    }, true,),
  );

  registerProvider(
    fallback,
    recordingProvider((key,) => {
      seen[fallback]!.push(key,);
    }, false,),
  );
}

/** Provider double recording the apiKey each attempt arrived with. */
function recordingProvider(record: (key: string | undefined,) => void, fails: boolean,): LLMProvider {
  return {
    capabilities: { streaming: false, },
    complete: async (req: GenerateRequest,) => {
      record(req.apiKey,);
      if (fails) { throw new Error("upstream 500",); }
      return {
        content: "fallback answered",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
      };
    },
    stream: () => Promise.reject(new Error("unused",),),
    healthCheck: () => Promise.resolve({ status: "ok" as const, },),
    listModels: () => Promise.resolve([],),
  } as unknown as LLMProvider;
}

function byoConfig(): Config {
  const instance = (name: string,) => ({
    name,
    label: name,
    baseUrl: `http://${name}.invalid/v1`,
    model: "m",
    timeout: 1000,
    retries: 0,
    allowUserApiKey: true,
    models: {},
  });

  const config: Config = {
    ...loadConfig(),
    generation: {
      providers: {
        openaiCompatible: [instance(PRIMARY,), instance(FALLBACK,),],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: undefined,
      },
      defaultProvider: PRIMARY,
      defaultModels: {},
    },
  };

  config.byoKey = { enabled: true, encryptionKey: SECRET, } as Config["byoKey"];
  return config;
}

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  ({ db: testDb, sqlite: testSqlite, } = await createTestDb());
  await testDb.insertInto("users",).values({
    id: USER_ID,
    username: USER_ID,
    display_name: "Failover User",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();
},);

afterAll(async () => {
  unregisterProvider(PRIMARY,);
  unregisterProvider(FALLBACK,);
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);

describeReal("callWithFailover — BYO key scoping", () => {
  test("a failing primary's user key is never sent to the fallback vendor", async () => {
    const seen: Record<string, (string | undefined)[]> = { [PRIMARY]: [], [FALLBACK]: [], };
    installChain(seen, PRIMARY, FALLBACK,);

    await testDb.insertInto("user_api_keys",).values({
      user_id: USER_ID,
      provider_name: PRIMARY,
      api_key_encrypted: await encryptValue("sk-user-secret-for-a", SECRET,),
    },).execute();

    const config = byoConfig();
    const resolved = await resolveProvider({
      provider: PRIMARY,
      model: "m",
      userId: USER_ID,
      config,
      db: testDb,
    },);

    const response = await callWithFailover(buildFailoverList(PRIMARY, config,), {
      model: resolved.resolvedModel,
      messages: [],
      params: {},
      apiKey: resolved.resolvedApiKey,
      resolveApiKey: resolved.resolveApiKey,
    },);

    expect(response.content,).toBe("fallback answered",);
    expect(seen[PRIMARY],).toEqual(["sk-user-secret-for-a",],);
    expect(seen[FALLBACK],).toEqual([undefined,],);
  });

  test("a request without a resolver shares its single key across the chain", async () => {
    const seen: Record<string, (string | undefined)[]> = { [PRIMARY]: [], [FALLBACK]: [], };
    installChain(seen, PRIMARY, FALLBACK,);

    const response = await callWithFailover(buildFailoverList(PRIMARY, byoConfig(),), {
      model: "m",
      messages: [],
      params: {},
      apiKey: "sk-server-key",
    },);

    expect(response.content,).toBe("fallback answered",);
    expect(seen[PRIMARY],).toEqual(["sk-server-key",],);
    expect(seen[FALLBACK],).toEqual(["sk-server-key",],);
  });
},);
