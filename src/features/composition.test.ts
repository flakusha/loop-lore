// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AsyncStore, } from "../async/store";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { v1Routes, } from "../routes/v1";
import { createTestDb, } from "../test-utils/create-test-db";
import { resolveFeatures, } from "./resolve";
import { featuresForOpts, } from "./surface";

/** Mirror of the test-local async-store stubs used by the v1 barrel tests. */
function stubAsyncStore(): AsyncStore {
  return {
    track() {},
    progress() {},
    complete() {},
    fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 86_400_000, queueLimit: 10_000, },
    async flush() {},
    async read() {
      return null;
    },
    destroy() {},
  };
}

const PROFILES = ["full", "business-only", "rpg-chat-only", "local-only", "relay-only",] as const;

const EXPECTED = {
  "full": { chat: true, generation: true, business: true, harness: true, },
  "business-only": { chat: false, generation: false, business: true, harness: true, },
  "rpg-chat-only": { chat: true, generation: true, business: false, harness: false, },
  "local-only": { chat: true, generation: true, business: false, harness: false, },
  "relay-only": { chat: false, generation: false, business: false, harness: false, },
} as const;

function pathsFor(profile?: (typeof PROFILES)[number],): string[] {
  return v1Routes({
    database: db,
    config: {} as Config,
    asyncStore: stubAsyncStore(),
    ...(profile ? { features: resolveFeatures(profile,), } : {}),
  },).routes.map((r,) => r.path);
}

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

describe("v1 surface composition by feature profile", () => {
  for (const profile of PROFILES) {
    test(`${profile} exposes only its capability routes`, () => {
      const paths = pathsFor(profile,);
      const has = (prefix: string,) => paths.some((p,) => p.startsWith(prefix,));
      expect(paths,).toContain("/api/v1/auth/login",);
      expect(paths.includes("/api/v1/chats",),).toBe(EXPECTED[profile].chat,);
      expect(has("/api/v1/generation/",),).toBe(EXPECTED[profile].generation,);
      expect(has("/api/v1/integrations/webhooks",),).toBe(EXPECTED[profile].business,);
      expect(has("/api/v1/harness/",),).toBe(EXPECTED[profile].harness,);
    });
  }

  test("absent features default to the full surface", () => {
    const paths = pathsFor();
    expect(paths,).toContain("/api/v1/chats",);
    expect(paths.some((p,) => p.startsWith("/api/v1/generation/",)),).toBe(true,);
  });

  test("featuresForOpts keeps injected surface and resolves config profile", () => {
    expect(featuresForOpts({ config: {} as Config, },),).toEqual(resolveFeatures("full",),);
    const relay = resolveFeatures("relay-only",);
    expect(featuresForOpts({ config: {} as Config, features: relay, },),).toBe(relay,);
    expect(featuresForOpts({
      config: { features: { profile: "local-only", }, } as Config,
    },),).toEqual(resolveFeatures("local-only",),);
  });
});
