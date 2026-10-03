// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { Database, } from "bun:sqlite";
import { afterAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { ModelRole, } from "../db/enums-core/flags";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertModelRoleOverrides, } from "../test-utils/insert-helpers";
import {
  callAux,
  GM_TOOL_DETECTION_PROMPT,
  INTENT_CLASSIFIER_PROMPT,
  MEMORY_EXTRACTION_PROMPT,
  NSFW_POLICY_LEVELS_PROMPT,
  NSFW_POLICY_PROMPT,
  TRANSITION_CLASSIFIER_PROMPT,
} from "./index";
import type { AuxCallOptions, AuxCallResult, AuxTaskName, } from "./types";

// ── prompt exports ────────────────────────────────────────────

describe("aux-pipeline prompts", () => {
  const PROMPTS: Array<{ name: string; val: string }> = [
    { name: "GM_TOOL_DETECTION_PROMPT", val: GM_TOOL_DETECTION_PROMPT, },
    { name: "INTENT_CLASSIFIER_PROMPT", val: INTENT_CLASSIFIER_PROMPT, },
    { name: "MEMORY_EXTRACTION_PROMPT", val: MEMORY_EXTRACTION_PROMPT, },
    { name: "NSFW_POLICY_LEVELS_PROMPT", val: NSFW_POLICY_LEVELS_PROMPT, },
    { name: "NSFW_POLICY_PROMPT", val: NSFW_POLICY_PROMPT, },
    { name: "TRANSITION_CLASSIFIER_PROMPT", val: TRANSITION_CLASSIFIER_PROMPT, },
  ];

  for (const p of PROMPTS) {
    test(`${p.name} is a non-empty string`, () => {
      expect(p.val,).toBeString();
      expect(p.val.length,).toBeGreaterThan(0,);
    });
  }

  test("all prompts are distinct", () => {
    const vals = PROMPTS.map((p,) => p.val);
    const seen: string[] = [];
    for (const v of vals) {
      if (!seen.includes(v,)) { seen.push(v,); }
    }
    expect(seen.length,).toBe(vals.length,);
  });
});

// ── types ────────────────────────────────────────────────────

describe("aux-pipeline types", () => {
  test("AuxTaskName covers all five known tasks", () => {
    const tasks: AuxTaskName[] = ["transition", "intent", "memory", "nsfw", "gm-tool",];
    expect(tasks.length,).toBe(5,);
  });

  test("AuxCallOptions partial shape", () => {
    const opts: AuxCallOptions = {};
    expect(opts.role,).toBeUndefined();
    expect(opts.timeoutMs,).toBeUndefined();
    expect(opts.userId,).toBeUndefined();
  });

  test("AuxCallResult complete shape", () => {
    const r: AuxCallResult = {
      content: "x",
      model: "m",
      provider: "p",
      latencyMs: 1,
      promptTokens: 0,
      completionTokens: 0,
    };
    expect(r.content,).toBe("x",);
    expect(r.latencyMs,).toBeGreaterThanOrEqual(0,);
  });
});

// ── callAux graceful degradation ─────────────────────────────

// ── classifier-role routing ──────────────────────────────────

/** Minimal Config stub sufficient for resolveModelRole + BYO resolution. */
function makeAuxConfig(): Parameters<typeof callAux>[1] {
  return {
    generation: {
      defaultProvider: "mock",
      defaultModels: {},
      providers: { openaiCompatible: [], },
    },
    byoKey: { enabled: false, encryptionKey: null, },
  } as unknown as Parameters<typeof callAux>[1];
}

/** Stub provider that records each requested model and returns a fixed body. */
function makeCapturingProvider(requested: string[],): LLMProvider {
  const response = (req: GenerateRequest,): GenerateResponse => {
    requested.push(req.model,);
    return {
      content: '{"rating":"sfw"}',
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
    };
  };
  return {
    capabilities: {
      type: "openai-compatible",
      label: "Stub",
      text: true,
      image: false,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
    },
    complete: async (req: GenerateRequest,) => response(req,),
    stream: async (req: GenerateRequest, _handler: never,) => response(req,),
    healthCheck: async () => ({ status: "ok", model: "mock", }),
    listModels: async () => [],
  };
}

describe("callAux classifier-role routing", () => {
  afterAll(() => {
    unregisterProvider("mock",);
  },);

  test("classifier-preferring task uses configured classifier model", async () => {
    const testDb = await createTestDb();
    await insertModelRoleOverrides(testDb.db, "mock", "mock-classifier-model", { role: ModelRole.Classifier, },);
    const requested: string[] = [];
    unregisterProvider("mock",);
    registerProvider("mock", makeCapturingProvider(requested,),);
    const result = await callAux(
      "intent",
      makeAuxConfig(),
      testDb.db,
      [{ role: "user", content: "ping", },],
    );
    expect(result,).not.toBeNull();
    expect(result?.model,).toBe("mock-classifier-model",);
    expect(requested,).toEqual(["mock-classifier-model",],);
    await testDb.db.destroy();
  });

  test("unconfigured classifier falls back to auxiliary model", async () => {
    const testDb = await createTestDb();
    await insertModelRoleOverrides(testDb.db, "mock", "mock-aux-model", { role: ModelRole.Auxiliary, },);
    const requested: string[] = [];
    unregisterProvider("mock",);
    registerProvider("mock", makeCapturingProvider(requested,),);
    const result = await callAux(
      "transition",
      makeAuxConfig(),
      testDb.db,
      [{ role: "user", content: "ping", },],
    );
    expect(result,).not.toBeNull();
    expect(result?.model,).toBe("mock-aux-model",);
    expect(requested,).toEqual(["mock-aux-model",],);
    await testDb.db.destroy();
  });

  test("explicit opts.role wins over classifier preference", async () => {
    const testDb = await createTestDb();
    await insertModelRoleOverrides(testDb.db, "mock", "mock-classifier-model", { role: ModelRole.Classifier, },);
    await insertModelRoleOverrides(testDb.db, "mock", "mock-caption-model", { role: ModelRole.Captioning, },);
    const requested: string[] = [];
    unregisterProvider("mock",);
    registerProvider("mock", makeCapturingProvider(requested,),);
    const result = await callAux(
      "intent",
      makeAuxConfig(),
      testDb.db,
      [{ role: "user", content: "ping", },],
      { role: ModelRole.Captioning, },
    );
    expect(result,).not.toBeNull();
    expect(result?.model,).toBe("mock-caption-model",);
    expect(requested,).toEqual(["mock-caption-model",],);
    await testDb.db.destroy();
  });

  test("moderation task resolves Classifier when configured, Auxiliary when not", async () => {
    const configuredDb = await createTestDb();
    await insertModelRoleOverrides(configuredDb.db, "mock", "mock-classifier-model", { role: ModelRole.Classifier, },);
    const requestedConfigured: string[] = [];
    unregisterProvider("mock",);
    registerProvider("mock", makeCapturingProvider(requestedConfigured,),);
    const configured = await callAux(
      "moderation",
      makeAuxConfig(),
      configuredDb.db,
      [{ role: "user", content: "ping", },],
    );
    expect(configured?.model,).toBe("mock-classifier-model",);
    expect(requestedConfigured,).toEqual(["mock-classifier-model",],);
    await configuredDb.db.destroy();

    const unconfiguredDb = await createTestDb();
    await insertModelRoleOverrides(unconfiguredDb.db, "mock", "mock-aux-model", { role: ModelRole.Auxiliary, },);
    const requestedUnconfigured: string[] = [];
    unregisterProvider("mock",);
    registerProvider("mock", makeCapturingProvider(requestedUnconfigured,),);
    const unconfigured = await callAux(
      "moderation",
      makeAuxConfig(),
      unconfiguredDb.db,
      [{ role: "user", content: "ping", },],
    );
    expect(unconfigured?.model,).toBe("mock-aux-model",);
    expect(requestedUnconfigured,).toEqual(["mock-aux-model",],);
    await unconfiguredDb.db.destroy();
  });
});

describe("callAux graceful failure", () => {
  test("returns null when no model role is resolved", async () => {
    // Minimal in-memory DB + empty config: resolveModelRole returns null.
    // BUG-callaux: if resolveModelRole throws instead, this test fails and
    // documents the regression (empty config.generation must not crash).
    const sqlite = new Database(":memory:",);
    const dialect = createSqliteDialect(sqlite,);
    const db = new Kysely<DB>({ dialect, },);
    const config = {} as Parameters<typeof callAux>[1];
    const result = await callAux(
      "transition",
      config,
      db,
      [{ role: "user", content: "ping", },],
    );
    expect(result,).toBeNull();
    await db.destroy();
  });
});
