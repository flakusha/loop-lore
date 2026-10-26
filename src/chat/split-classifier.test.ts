// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `src/chat/split-classifier.ts`.
 *
 * The classifier is regex-first with an opt-in AUX-LLM fallback, so these
 * tests pin the three verdict sources callers depend on: a regex hit never
 * pays for an AUX call, an aux JSON verdict is parsed, and a null / garbage /
 * non-boolean aux reply degrades to `{ isSplit: false, isReunite: false,
 * source: "none" }` — the fallback the per-message hot path always sees.
 *
 * The fallback runs through the real `callAux` policy (role resolution →
 * scheduler → provider) with a registered stub provider instead of a
 * `mock.module` double: bun's `mock.module` is process-global and cannot be
 * un-hooked, while the aux task→provider seam is exactly what this contract
 * depends on (same shape as `service/carriage-authoring.test.ts`).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { classifySplitIntent, } from "./split-classifier";

const STUB_PROVIDER = "stub-split-classifier";
const STUB_MODEL = "stub-classifier-model";

/** Response body the stub provider returns for the current test. */
let stubContent = "";
/** Whether the stub provider should throw instead of answering. */
let stubThrows = false;
/** Every request the stub provider saw (aux-input assertions). */
let stubCalls: GenerateRequest[] = [];

registerProvider(
  STUB_PROVIDER,
  {
    capabilities: {
      type: "openai-compatible",
      label: "stub split-classifier provider",
      text: true,
      image: false,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
    },
    complete: async (req: GenerateRequest,): Promise<GenerateResponse> => {
      stubCalls.push(req,);
      if (stubThrows) { throw new Error("stub provider unavailable",); }
      return {
        content: stubContent,
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
      };
    },
    stream: () => {
      throw new Error("streaming not supported by stub provider",);
    },
    healthCheck: () => Promise.resolve({ status: "ok", },),
    listModels: () => Promise.resolve([],),
  } satisfies LLMProvider,
);

// The provider registry is process-global: unregister so later suites see a pristine registry.
afterAll(() => {
  unregisterProvider(STUB_PROVIDER,);
},);

/** Minimal Config sufficient for resolveModelRole. */
function makeConfig(): Config {
  return { generation: {}, templates: {}, } as unknown as Config;
}

/** Reset stub provider state between tests. */
function resetStub(): void {
  stubContent = "";
  stubThrows = false;
  stubCalls = [];
}

describe("classifySplitIntent", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    // Point the AUX role at the stub so the fallback never reaches a real provider.
    await db
      .insertInto("model_role_overrides",)
      .values({ role: "auxiliary", provider: STUB_PROVIDER, model: STUB_MODEL, },)
      .execute();

    resetStub();
  },);

  afterEach(() => {
    sqlite.close();
  },);

  describe("regex verdicts (always free)", () => {
    it("returns source regex for split narration without calling aux", async () => {
      const result = await classifySplitIntent("We split up at the crossroads.", makeConfig(), db, {
        allowAux: true,
      },);

      expect(result,).toEqual({ isSplit: true, isReunite: false, source: "regex", },);
      // Even with the fallback opted in, a regex hit must not buy an LLM call.
      expect(stubCalls,).toHaveLength(0,);
    });

    it("returns source regex for reunite narration without calling aux", async () => {
      const result = await classifySplitIntent("The party reunites at the keep.", makeConfig(), db, {
        allowAux: true,
      },);

      expect(result,).toEqual({ isSplit: false, isReunite: true, source: "regex", },);
      expect(stubCalls,).toHaveLength(0,);
    });
  });

  describe("aux fallback (opt-in)", () => {
    it("does not call aux on a regex miss unless opted in", async () => {
      const result = await classifySplitIntent("The rain keeps us indoors.", makeConfig(), db,);

      expect(result,).toEqual({ isSplit: false, isReunite: false, source: "none", },);
      expect(stubCalls,).toHaveLength(0,);
    });

    it("parses an isSplit verdict from the aux JSON payload", async () => {
      stubContent = '{"isSplit": true}';

      const result = await classifySplitIntent(
        "Time to go our separate ways.",
        makeConfig(),
        db,
        { allowAux: true, userId: "user-1", },
      );

      expect(result,).toEqual({ isSplit: true, isReunite: false, source: "aux-llm", },);
      expect(stubCalls,).toHaveLength(1,);
      // Aux input: the raw message, pinned to the classifier's sampling shape.
      expect(stubCalls[0]?.model,).toBe(STUB_MODEL,);
      expect(stubCalls[0]?.messages,).toHaveLength(1,);
      expect(stubCalls[0]?.messages[0]?.role,).toBe("user",);
      expect(stubCalls[0]?.messages[0]?.content,).toBe("Time to go our separate ways.",);
      expect(stubCalls[0]?.params,).toMatchObject({ temperature: 0, maxTokens: 60, },);
    });

    it("parses an isReunite verdict from the aux JSON payload", async () => {
      stubContent = '{"isReunite": true}';

      const result = await classifySplitIntent("We find each other again.", makeConfig(), db, {
        allowAux: true,
      },);

      expect(result,).toEqual({ isSplit: false, isReunite: true, source: "aux-llm", },);
    });

    it("reports a negative aux verdict as an aux-llm answer", async () => {
      stubContent = '{"isSplit": false, "isReunite": false}';

      const result = await classifySplitIntent("The rain keeps us indoors.", makeConfig(), db, {
        allowAux: true,
      },);

      // A parsed `false` is a real answer, not a fallback — source says who answered.
      expect(result,).toEqual({ isSplit: false, isReunite: false, source: "aux-llm", },);
    });

    it("falls back to no intent on an unparseable aux reply", async () => {
      stubContent = "sounds like a split to me";

      const result = await classifySplitIntent("The rain keeps us indoors.", makeConfig(), db, {
        allowAux: true,
      },);

      expect(result,).toEqual({ isSplit: false, isReunite: false, source: "none", },);
      expect(stubCalls,).toHaveLength(1,);
    });

    it("falls back to no intent on a non-boolean aux verdict", async () => {
      stubContent = '{"isSplit": "yes", "isReunite": 1}';

      const result = await classifySplitIntent("The rain keeps us indoors.", makeConfig(), db, {
        allowAux: true,
      },);

      expect(result,).toEqual({ isSplit: false, isReunite: false, source: "none", },);
    });

    it("falls back to no intent when the aux call yields null", async () => {
      stubThrows = true;

      const result = await classifySplitIntent("The rain keeps us indoors.", makeConfig(), db, {
        allowAux: true,
      },);

      expect(result,).toEqual({ isSplit: false, isReunite: false, source: "none", },);
      // One attempt was made; callAux's own graceful degradation returned null.
      expect(stubCalls,).toHaveLength(1,);
    });

    it("falls back to no intent when the configured aux provider is not registered", async () => {
      await db.deleteFrom("model_role_overrides",).execute();
      await db
        .insertInto("model_role_overrides",)
        .values({ role: "auxiliary", provider: "stub-split-classifier-absent", model: "m", },)
        .execute();

      const result = await classifySplitIntent("The rain keeps us indoors.", makeConfig(), db, {
        allowAux: true,
      },);

      expect(result,).toEqual({ isSplit: false, isReunite: false, source: "none", },);
      expect(stubCalls,).toHaveLength(0,);
    });
  });
});
