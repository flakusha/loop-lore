// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Precedence tests for the single translation-target module:
 * display-locale chain, effective native-locale chain, and the eager
 * trigger comparator.
 *
 * Resource contract: the storage-touching suite uses one fresh in-memory DB
 * per test (createTestDb in beforeEach), destroyed in afterEach; no global
 * stubs, no files, no ports.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  CONTENT_LANGUAGE_KEY,
  DEFAULT_NATIVE_LOCALE,
  readChatContentLanguage,
  readUserContentLocale,
  resolveDisplayLocale,
  resolveEffectiveNativeLocale,
  setChatContentLanguage,
  shouldTriggerEagerTranslation,
} from "./translation-target";

function makeConfig(providers: Record<string, unknown>,): Config {
  const defaults = createConfigSchema().defaults as unknown as {
    generation: Record<string, unknown>;
  };

  defaults.generation.providers = providers;
  return defaults as unknown as Config;
}

describe("readChatContentLanguage / setChatContentLanguage", () => {
  test("reads the unified key and falls back read-through to story_state", () => {
    expect(readChatContentLanguage(
      JSON.stringify({ [CONTENT_LANGUAGE_KEY]: "ja", },),
      null,
    ),).toBe("ja",);

    expect(readChatContentLanguage(null, JSON.stringify({ autoTranslateLang: "de", },),),).toBe("de",);
    // Unified key wins over the legacy fallback.
    expect(readChatContentLanguage(
      JSON.stringify({ [CONTENT_LANGUAGE_KEY]: "fr", },),
      JSON.stringify({ autoTranslateLang: "de", },),
    ),).toBe("fr",);

    expect(readChatContentLanguage(null, null,),).toBeNull();
  });

  test("set merges into gm_config and clear removes the key", () => {
    const merged = setChatContentLanguage(JSON.stringify({ carriageEnabled: true, },), "ja",);
    expect(readChatContentLanguage(merged, null,),).toBe("ja",);
    expect(JSON.parse(merged ?? "{}",) as Record<string, unknown>,).toHaveProperty("carriageEnabled",);

    const cleared = setChatContentLanguage(merged, null,);
    expect(readChatContentLanguage(cleared, null,),).toBeNull();
  });
});

describe("resolveDisplayLocale precedence", () => {
  test("message > chat > user > UI locale", () => {
    const inputs = {
      messageLocale: "ja",
      chatGmConfig: JSON.stringify({ [CONTENT_LANGUAGE_KEY]: "fr", },),
      chatStoryState: null,
      userSettings: JSON.stringify({ contentLocale: "de", },),
      uiLocale: "es",
    };

    expect(resolveDisplayLocale(inputs,),).toBe("ja",);
    expect(resolveDisplayLocale({ ...inputs, messageLocale: null, },),).toBe("fr",);
    expect(resolveDisplayLocale({ ...inputs, messageLocale: null, chatGmConfig: null, },),).toBe("de",);
    expect(resolveDisplayLocale({
      ...inputs,
      messageLocale: null,
      chatGmConfig: null,
      userSettings: null,
    },),).toBe("es",);
  });

  test("malformed codes at a rung are skipped, not fatal", () => {
    expect(resolveDisplayLocale({
      messageLocale: "klingon",
      chatGmConfig: null,
      chatStoryState: null,
      userSettings: JSON.stringify({ contentLocale: "xx!", },),
      uiLocale: "de",
    },),).toBe("de",);

    expect(resolveDisplayLocale({
      messageLocale: null,
      chatGmConfig: null,
      chatStoryState: null,
      userSettings: null,
      uiLocale: null,
    },),).toBeNull();
  });

  test("well-formed non-catalog codes win at the translation rungs", () => {
    expect(resolveDisplayLocale({
      messageLocale: "tlh",
      chatGmConfig: null,
      chatStoryState: null,
      userSettings: null,
      uiLocale: "de",
    },),).toBe("tlh",);

    expect(resolveDisplayLocale({
      messageLocale: null,
      chatGmConfig: null,
      chatStoryState: null,
      userSettings: JSON.stringify({ contentLocale: "xx", },),
      uiLocale: "de",
    },),).toBe("xx",);
  });

  test("readUserContentLocale ignores unknown codes", () => {
    expect(readUserContentLocale(JSON.stringify({ contentLocale: "ja", },),),).toBe("ja",);
    expect(readUserContentLocale(JSON.stringify({ contentLocale: "nope", },),),).toBeNull();
    // Well-formed tags outside the 10-entry UI registry are accepted and
    // returned in canonical case.
    expect(readUserContentLocale(JSON.stringify({ contentLocale: "en-us", },),),).toBe("en-US",);
  });
});

describe("resolveEffectiveNativeLocale chain", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;

  beforeEach(async () => {
    fixture = await createTestDb();
    db = fixture.db;
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
  },);

  test("model_capabilities.native_locale wins, then provider config, then chat, then en", async () => {
    const now = new Date().toISOString();
    const base = {
      context_window: null,
      max_output: null,
      supports_tools: 0,
      supports_vision: 0,
      supports_thinking: 0,
      modalities: null,
      param_size: null,
      owned_by: null,
      user_override: 0,
      notes: null,
      last_seen: now,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto("model_capabilities",).values({
      ...base,
      id: crypto.randomUUID(),
      provider_id: "p1",
      model_id: "m1",
      native_locale: "ja",
    },).execute();

    await db.insertInto("model_capabilities",).values({
      ...base,
      id: crypto.randomUUID(),
      provider_id: "p2",
      model_id: "m2",
      native_locale: null,
    },).execute();

    const config = makeConfig({
      openaiCompatible: [{ name: "p2", locale: "fr", }, { name: "p3", },],
    },);

    const chat = JSON.stringify({ [CONTENT_LANGUAGE_KEY]: "de", },);

    // Rung 1: DB override.
    expect(
      await resolveEffectiveNativeLocale({
        db,
        config,
        provider: "p1",
        model: "m1",
        chatGmConfig: chat,
        chatStoryState: null,
      },),
    ).toBe("ja",);
    // Rung 2: provider config locale.

    expect(
      await resolveEffectiveNativeLocale({
        db,
        config,
        provider: "p2",
        model: "m2",
        chatGmConfig: chat,
        chatStoryState: null,
      },),
    ).toBe("fr",);
    // Rung 3: chat content-language assumption.

    expect(
      await resolveEffectiveNativeLocale({
        db,
        config,
        provider: "p3",
        model: "m3",
        chatGmConfig: chat,
        chatStoryState: null,
      },),
    ).toBe("de",);
    // Rung 4: default.

    expect(
      await resolveEffectiveNativeLocale({
        db,
        config,
        provider: "p3",
        model: "m3",
        chatGmConfig: null,
        chatStoryState: null,
      },),
    ).toBe(DEFAULT_NATIVE_LOCALE,);
  });
});

describe("eager trigger comparator", () => {
  test("fires only when display and native differ", () => {
    expect(shouldTriggerEagerTranslation("ja", "en",),).toBe(true,);
    expect(shouldTriggerEagerTranslation("en", "en",),).toBe(false,);
    // No display preference → lazy.
    expect(shouldTriggerEagerTranslation(null, "en",),).toBe(false,);
  });
});
