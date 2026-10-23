// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for classifier template-pack selection (priority, tags, when-guards,
 * fall-through, layer provenance, vocabulary validation) and the consumer
 * resolver (pack > override > default, back-compat with no packs).
 *
 * Resource contract: the resolver tests use one fresh in-memory DB per test,
 * collected into `fixtures` and destroyed in afterEach; everything else is
 * pure in-memory config objects; no files, no ports, no global stubs.
 */
import { afterEach, beforeAll, describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import type { ClassTemplateConfig, LlmTemplateConfig, } from "../config/sections/templates";
import { createLogger, } from "../logger";
import { LLM_PROMPT_DEFAULTS, } from "../prompts/registry";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  CLASSIFIER_TAG_VOCABULARY_KEY,
  CLASSIFIER_TAGS_ACTIVE_PREFIX,
  resolveClassifierPrompt,
} from "./class-template-resolver";
import {
  buildClassTemplateIndex,
  selectClassTemplate,
} from "./class-template-select";

/** Pack factory with sensible defaults. */
function pack(overrides: Partial<ClassTemplateConfig>,): ClassTemplateConfig {
  return {
    id: "p",
    name: "P",
    serves: ["intent",],
    tags: [],
    template: "PACK TEMPLATE",
    ...overrides,
  };
}

/** Section factory. */
function section(packs: ClassTemplateConfig[],): { classifiers: Record<string, ClassTemplateConfig> } {
  return { classifiers: Object.fromEntries(packs.map((p,) => [p.id, p,]),), };
}

/** Minimal config stub carrying only the templates the resolver reads. */
function makeConfig(
  llm: LlmTemplateConfig,
  classifiers: Record<string, ClassTemplateConfig>,
): Config {
  return { templates: { llm, classifiers: { merge: "extend", classifiers, }, }, } as unknown as Config;
}

const DEFAULT_LLM: LlmTemplateConfig = { merge: "extend", systemPrompts: {}, chatFormats: {}, };

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("buildClassTemplateIndex", () => {
  test("orders priority-desc, stable by insertion within a priority", () => {
    const a = pack({ id: "a", priority: 5, },);
    const b = pack({ id: "b", priority: 10, },);
    const c = pack({ id: "c", priority: 10, },);
    const index = buildClassTemplateIndex(section([a, b, c,],),);
    expect(index.byTask("intent",).map((p,) => p.id),).toEqual(["b", "c", "a",],);
  });

  test("skips packs without a template and other tasks", () => {
    const index = buildClassTemplateIndex(section([pack({ id: "empty", template: "", },),],),);
    expect(index.byTask("intent",),).toEqual([],);
  });
});

describe("selectClassTemplate", () => {
  test("returns null when nothing matches → fall through", () => {
    const templates = section([pack({ tags: ["pacing",], },),],);
    expect(selectClassTemplate(templates, { task: "intent", tags: [], },),).toBeNull();
    expect(selectClassTemplate(section([],), { task: "intent", tags: [], },),).toBeNull();
  });

  test("every pack tag must be present on the query", () => {
    const templates = section([pack({ tags: ["pacing", "group",], },),],);
    const query = { task: "intent" as const, tags: [{ tag: "pacing", layer: "chat" as const, },], };
    expect(selectClassTemplate(templates, query,),).toBeNull();
  });

  test("when.chatMode guard must hold", () => {
    const templates = section([pack({ when: { chatMode: ["story",], }, },),],);
    expect(
      selectClassTemplate(templates, { task: "intent", tags: [], chatMode: "direct", },),
    ).toBeNull();

    expect(
      selectClassTemplate(templates, { task: "intent", tags: [], chatMode: "story", },)?.template.id,
    ).toBe("p",);

    // A guard without a query chat mode never matches.
    expect(selectClassTemplate(templates, { task: "intent", tags: [], },),).toBeNull();
  });

  test("highest priority wins among matching packs", () => {
    const low = pack({ id: "low", priority: 1, },);
    const high = pack({ id: "high", priority: 7, },);
    const result = selectClassTemplate(section([low, high,],), { task: "intent", tags: [], },);
    expect(result?.template.id,).toBe("high",);
  });

  test("empty pack tags match any query (context-free packs)", () => {
    const result = selectClassTemplate(section([pack({},),],), { task: "intent", tags: [], },);
    expect(result?.template.id,).toBe("p",);
  });

  test("query tags outside the vocabulary are dropped", () => {
    const templates = section([pack({ tags: ["pacing",], },),],);
    const query = {
      task: "intent" as const,
      tags: [{ tag: "pacing", layer: "chat" as const, },],
      vocabulary: ["other",],
    };

    expect(selectClassTemplate(templates, query,),).toBeNull();
  });

  test("empty vocabulary makes tag-gated packs inert", () => {
    const templates = section([pack({ tags: ["pacing",], },),],);
    const query = {
      task: "intent" as const,
      tags: [{ tag: "pacing", layer: "chat" as const, },],
      vocabulary: [],
    };

    expect(selectClassTemplate(templates, query,),).toBeNull();
  });

  test("provenance records which layer supplied each matched tag", () => {
    const templates = section([pack({ tags: ["pacing", "stealth",], },),],);
    const result = selectClassTemplate(section([pack({ tags: ["pacing",], },),],), {
      task: "intent",
      tags: [
        { tag: "pacing", layer: "chat", },
        { tag: "pacing", layer: "actor", },
      ],
      vocabulary: ["pacing",],
    },);

    expect(result?.matchedTags,).toEqual([{ tag: "pacing", layers: ["chat", "actor",], },],);

    const actorOnly = selectClassTemplate(templates, {
      task: "intent",
      tags: [
        { tag: "pacing", layer: "actor", },
        { tag: "stealth", layer: "actor", },
      ],
      vocabulary: ["pacing", "stealth",],
    },);

    expect(actorOnly?.matchedTags,).toEqual([
      { tag: "pacing", layers: ["actor",], },
      { tag: "stealth", layers: ["actor",], },
    ],);
  });
});

describe("resolveClassifierPrompt", () => {
  // Fresh in-memory DB per test, destroyed in afterEach so no handle leaks.
  const fixtures: TestDb[] = [];

  afterEach(async () => {
    while (fixtures.length > 0) {
      await destroyTestDb(fixtures.pop()!,);
    }
  },);

  test("no packs configured → exactly the purpose default (back-compat)", async () => {
    const fixture = await createTestDb();
    fixtures.push(fixture,);
    const { db, } = fixture;
    const config = makeConfig(DEFAULT_LLM, {},);
    const result = await resolveClassifierPrompt({ config, db, task: "intent", },);
    expect(LLM_PROMPT_DEFAULTS.intent,).toBe(result.prompt,);
    expect(result.packId,).toBeNull();
    expect(result.params,).toBeUndefined();
  });

  test("pack wins over the purpose default and surfaces its params", async () => {
    const fixture = await createTestDb();
    fixtures.push(fixture,);
    const { db, } = fixture;
    await db
      .insertInto("system_config",)
      .values({
        key: CLASSIFIER_TAG_VOCABULARY_KEY,
        value: JSON.stringify(["pacing",],),
        description: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },)
      .execute();

    await db
      .insertInto("system_config",)
      .values({
        key: `${CLASSIFIER_TAGS_ACTIVE_PREFIX}chat-1`,
        value: JSON.stringify(["pacing",],),
        description: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },)
      .execute();

    const classifiers = {
      "scene-pacing": pack({
        id: "scene-pacing",
        tags: ["pacing",],
        priority: 5,
        params: { temperature: 0.2, maxTokens: 64, },
      },),
    };

    const config = makeConfig(DEFAULT_LLM, classifiers,);

    const result = await resolveClassifierPrompt({ config, db, task: "intent", chatId: "chat-1", },);
    expect(result.prompt,).toBe("PACK TEMPLATE",);
    expect(result.packId,).toBe("scene-pacing",);
    expect(result.params,).toEqual({ temperature: 0.2, maxTokens: 64, },);

    // Without the chat's active tags the same packs fall through.
    const noTags = await resolveClassifierPrompt({ config, db, task: "intent", },);
    expect(LLM_PROMPT_DEFAULTS.intent,).toBe(noTags.prompt,);
  });
});
