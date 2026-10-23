// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the per-chat auto-translation target.
 *
 * Pins the trust-boundary contract:
 *   - PATCH sets the story_state target and echoes it back.
 *   - PATCH with an unknown code is a 400.
 *   - DELETE clears the target (null echo).
 *   - Non-participants get 403; unknown chats get 404.
 *
 * Resource contract: provider-registry names are unique per run and
 * unregistered in afterEach/finally; flat tests get a fresh in-memory DB
 * collected into `fixtures` and destroyed in afterEach, the nested suite
 * uses beforeEach/afterEach; requests go through app.handle(), no listener
 * is bound; no files.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { autoTranslateText, buildTranslateDeps, resolveTargetLang, } from "../../chat/auto-translate";
import { readChatContentLanguage, } from "../../chat/translation-target";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, LLMProvider, } from "../../generation/providers/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { autoTranslateRoutes, } from "./auto-translate";

const OWNER_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const CHAT_ID = randomUUID();
// Provider names are unique per RUN: the registry is process-global and
// registerProvider() is idempotent (registry.ts:36-38), so a fixed name lets a
// sibling file's registration silently win and these stubs never install.
// Teardown unregisters each in `finally`.
const RUN_ID = randomUUID().slice(0, 8,);
const GENERAL_PROVIDER = `at-test-general-${RUN_ID}`;
const GENERAL_MODEL = "at-general-model";
const TRANSLATOR_PROVIDER = `at-test-translator-${RUN_ID}`;
const TRANSLATOR_MODEL = "at-translator-model";

/**
 * Stub provider that records the model it was asked to use.
 * @param onCall - Invoked with the requested model on every completion.
 * @returns A stub LLMProvider.
 */
function makeEchoProvider(onCall: (model: string,) => void,): LLMProvider {
  return {
    capabilities: { label: "Auto Translate Test Provider", streaming: false, },
    complete: async (req: GenerateRequest,) => {
      onCall(req.model,);
      return { content: "hola", };
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;
}

/**
 * Full config (schema defaults) with a general model and the given modelRoles.
 * @param modelRoles - The `generation.modelRoles` map to install.
 * @returns A Config the provider registry can resolve against.
 */
function makeTranslateConfig(modelRoles: Record<string, unknown>,): Config {
  const defaults = createConfigSchema().defaults as unknown as {
    generation: Record<string, unknown>;
  };

  defaults.generation.defaultProvider = GENERAL_PROVIDER;
  defaults.generation.defaultModels = { [GENERAL_PROVIDER]: GENERAL_MODEL, };
  defaults.generation.modelRoles = modelRoles;
  return defaults as unknown as Config;
}

/**
 * Build the route app with a fixed session identity injected.
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole: "user", }))
    .use(autoTranslateRoutes({ database: db, config, },),);
}

/**
 * Seed an owner user/actor and an owner-created chat.
 * @param db
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, `out-${OUTSIDER_ID}`, "Outsider", { id: OUTSIDER_ID, } as never,);
  await insertActors(db, "Outsider", { id: OUTSIDER_ID, user_id: OUTSIDER_ID, owner_id: OUTSIDER_ID, } as never,);
  await insertChats(db, "Party", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, },);
}

describe("autoTranslateRoutes", () => {
  // DBs created in the flat tests below, destroyed in afterEach so an
  // undisposed bun:sqlite handle never leaks to sibling files.
  const fixtures: TestDb[] = [];

  afterEach(async () => {
    while (fixtures.length > 0) {
      await destroyTestDb(fixtures.pop()!,);
    }
  },);

  test("PATCH sets the target and echoes it back", async () => {
    const fixture = await createTestDb();
    fixtures.push(fixture,);
    const { db, } = fixture;
    await seed(db,);
    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "es", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const json = await res.json() as { data: { targetLang: string | null } };
    expect(json.data.targetLang,).toBe("es",);
    // Alias contract: the unified gm_config.contentLanguage key is written
    // and the legacy story_state fallback is cleared so it never disagrees.
    const row = await db.selectFrom("chats",).select(["gm_config", "story_state",],).where("id", "=", CHAT_ID,)
      .executeTakeFirst();

    expect(readChatContentLanguage(row?.gm_config ?? null, row?.story_state ?? null,),).toBe("es",);
    expect(resolveTargetLang(row?.story_state ?? null,),).toBeNull();
  });

  test("PATCH with an unknown code is a 400", async () => {
    const fixture = await createTestDb();
    fixtures.push(fixture,);
    const { db, } = fixture;
    await seed(db,);
    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "klingon", },),
      },),
    );

    expect(res.status,).toBe(400,);
  });

  test("DELETE clears the target", async () => {
    const fixture = await createTestDb();
    fixtures.push(fixture,);
    const { db, } = fixture;
    await seed(db,);
    const app = makeApp(db, OWNER_ID,);
    await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "ja", },),
      },),
    );

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(200,);
    const json = await res.json() as { data: { targetLang: string | null } };
    expect(json.data.targetLang,).toBeNull();
  });

  test("non-participant gets 403", async () => {
    const fixture = await createTestDb();
    fixtures.push(fixture,);
    const { db, } = fixture;
    await seed(db,);
    const app = makeApp(db, OUTSIDER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "es", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });

  test("unknown chat gets 404", async () => {
    const fixture = await createTestDb();
    fixtures.push(fixture,);
    const { db, } = fixture;
    await seed(db,);
    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${randomUUID()}/auto-translate`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetLang: "es", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("buildTranslateDeps never rejects without a configured provider", async () => {
    const fixture = await createTestDb();
    fixtures.push(fixture,);
    const { db, } = fixture;
    const config = createConfigSchema().defaults as Config;
    const deps = await buildTranslateDeps(db, config, OWNER_ID,);
    expect(typeof deps,).toBe("object",);
  });

  // The consumer contract: the model a translation actually calls with comes
  // from the translator role, not unconditionally from the general model.
  //
  // These share one fixture disposed in `afterEach`: an undisposed bun:sqlite
  // handle leaks, and per src/test-utils/create-test-db.ts a closed handle left
  // in the process-global override is handed to every sibling file.
  describe("translator role wiring", () => {
    let fixture: TestDb;

    beforeEach(async () => {
      fixture = await createTestDb();
    },);

    afterEach(async () => {
      await destroyTestDb(fixture,);
    },);

    test("buildTranslateDeps translates with the configured translator model", async () => {
      let captured = "";
      registerProvider(
        TRANSLATOR_PROVIDER,
        makeEchoProvider((model,) => {
          captured = model;
        },),
      );

      registerProvider(
        GENERAL_PROVIDER,
        makeEchoProvider((model,) => {
          captured = `general:${model}`;
        },),
      );

      try {
        const config = makeTranslateConfig({
          translator: { provider: TRANSLATOR_PROVIDER, model: TRANSLATOR_MODEL, },
        },);

        const deps = await buildTranslateDeps(fixture.db, config, OWNER_ID,);
        expect(deps.model,).toBe(TRANSLATOR_MODEL,);
        await deps.complete?.({
          model: deps.model ?? "",
          messages: [{ role: "user", content: "hello", },],
          params: { maxTokens: 16, temperature: 0, },
        },);

        expect(captured,).toBe(TRANSLATOR_MODEL,);
      } finally {
        unregisterProvider(TRANSLATOR_PROVIDER,);
        unregisterProvider(GENERAL_PROVIDER,);
      }
    });

    test("buildTranslateDeps falls back to the general model when translator is unset", async () => {
      let captured = "";
      registerProvider(
        GENERAL_PROVIDER,
        makeEchoProvider((model,) => {
          captured = model;
        },),
      );

      try {
        const config = makeTranslateConfig({},);

        const deps = await buildTranslateDeps(fixture.db, config, OWNER_ID,);
        expect(deps.model,).toBe(GENERAL_MODEL,);
        await deps.complete?.({
          model: deps.model ?? "",
          messages: [{ role: "user", content: "hello", },],
          params: { maxTokens: 16, temperature: 0, },
        },);

        expect(captured,).toBe(GENERAL_MODEL,);
      } finally {
        unregisterProvider(GENERAL_PROVIDER,);
      }
    });

    // A translator naming an unregistered provider must NOT quietly translate
    // on the general model — it degrades, and the caller keeps the original.
    test("buildTranslateDeps degrades instead of using the general model for a bad translator", async () => {
      registerProvider(GENERAL_PROVIDER, makeEchoProvider(() => {},),);

      try {
        const config = makeTranslateConfig({
          translator: { provider: "no-such-translator-provider", model: TRANSLATOR_MODEL, },
        },);

        const deps = await buildTranslateDeps(fixture.db, config, OWNER_ID,);
        expect(deps.complete,).toBeUndefined();

        const outcome = await autoTranslateText({
          text: "hello",
          storyState: JSON.stringify({ autoTranslateLang: "es", },),
          chatId: CHAT_ID,
          deps,
        },);

        expect(outcome.translated,).toBe(false,);
        expect(outcome.text,).toBe("hello",);
      } finally {
        unregisterProvider(GENERAL_PROVIDER,);
      }
    });
  });
});
