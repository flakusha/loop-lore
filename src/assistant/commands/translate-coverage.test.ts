// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parser/registration-branch coverage for the /translate command
 * (src/assistant/commands/translate.ts).
 *
 * Core LLM/fallback paths are covered by translate.test.ts; here the
 * remaining parse forms (usage, `<lang>`-last, unparseable, empty text,
 * unknown language passthrough) plus the registered `translate`/`tl`
 * handlers (no-db fast path and provider-resolution failure path).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import type { CommandContext, CommandHandler, CommandResult, } from "./registry";
import { getCommand, } from "./registry";
import { LANGUAGES, runTranslate } from "./translate";

/** Resolve a registered handler, failing loudly when missing. */
function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: /${name}`,); }
  return handler;
}

/** Minimal context — runTranslate ignores context fields. */
function ctx(): CommandContext {
  return { chatId: "chat-1", };
}

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

afterAll(() => {
  testSqlite.close();
},);

/** Config whose provider resolution always fails (unregistered default). */
function unresolvableConfig(): Config {
  return {
    ...loadConfig(),
    generation: {
      providers: {
        openaiCompatible: [],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: undefined,
      },
      defaultProvider: "sm-cov-no-such-provider",
      defaultModels: {},
    },
  };
}

describe("runTranslate — remaining parse branches", () => {
  test("shows usage when no args are given", async () => {
    const result = await runTranslate([], ctx(), {},);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("usage",);
    expect(result.systemMessage,).toContain("Supported languages",);
  });

  test("parses the <text> <lang> trailing form", async () => {
    const result = await runTranslate(["hello world", "es",], ctx(), {},);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Spanish",);
    expect(result.systemMessage,).toContain("hello world",);
    const payload = result.actionPayload as { targetLang: string; fallback: boolean };
    expect(payload.targetLang,).toBe("es",);
    expect(payload.fallback,).toBe(true,);
  });

  test("rejects input with no recognizable language", async () => {
    const result = await runTranslate(["hello", "world",], ctx(), {},);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Could not parse",);
  });

  test("rejects an empty text with a bare language code", async () => {
    const result = await runTranslate(["es",], ctx(), {},);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("No text provided",);
  });

  test("rejects an empty text in the <text> to <lang> form", async () => {
    const result = await runTranslate(["to", "es",], ctx(), {},);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("No text provided",);
  });

  test("passes unknown language codes through in the to-form", async () => {
    const result = await runTranslate(["hello", "to", "xx",], ctx(), {},);
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Translated to xx",);
  });

  test("falls back when the LLM returns blank content", async () => {
    const result = await runTranslate(["hello", "to", "fr",], ctx(), {
      complete: async () => ({ content: "   ", }),
    },);
    expect(result.handled,).toBe(true,);
    const payload = result.actionPayload as { fallback: boolean; translated: string };
    expect(payload.fallback,).toBe(true,);
    expect(payload.translated,).toBe("hello",);
  });

  test("documents every supported language code", () => {
    for (const code of ["en", "es", "fr", "de", "ja", "ko", "zh", "pt", "ru", "ar",]) {
      expect(LANGUAGES[code],).toBeDefined();
    }
  });
});

describe("registered translate/tl handlers", () => {
  test("/translate without db/config takes the local fallback", async () => {
    const result = await mustGet("translate",)(["hola", "to", "en",], ctx(),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("English",);
  });

  test("/translate falls back when provider resolution fails", async () => {
    const fullCtx: CommandContext = { chatId: "chat-1", db: testDb, config: unresolvableConfig(), };
    const result = await mustGet("translate",)(["bonjour", "to", "en",], fullCtx,) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("English",);
    const payload = result.actionPayload as { fallback: boolean };
    expect(payload.fallback,).toBe(true,);
  });

  test("/tl without db/config takes the local fallback", async () => {
    const result = await mustGet("tl",)(["hola", "to", "en",], ctx(),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("English",);
  });

  test("/tl falls back when provider resolution fails", async () => {
    const fullCtx: CommandContext = { chatId: "chat-1", db: testDb, config: unresolvableConfig(), };
    const result = await mustGet("tl",)(["bonjour", "to", "en",], fullCtx,) as CommandResult;
    expect(result.handled,).toBe(true,);
    const payload = result.actionPayload as { fallback: boolean };
    expect(payload.fallback,).toBe(true,);
  });
});
