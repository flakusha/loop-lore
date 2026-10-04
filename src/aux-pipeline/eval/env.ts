// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Prompt-Eval Environment
 *
 * Builds the isolated runtime the eval runner executes classifiers in:
 * in-memory DB + model-role overrides + a registered provider. Mock mode is
 * deterministic and always runnable; endpoint mode routes through a real
 * OpenAI-compatible endpoint (env-selected) for live prompt evaluation.
 */
import type { Kysely, } from "kysely";
import type { Config, ProviderInstanceConfig, } from "../../config/schema";
import { ModelRole, } from "../../db/enums-core";
import type { DB, } from "../../db/schema";
import { OpenAiCompatibleProvider, } from "../../generation/providers/openai-compatible";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertModelRoleOverrides, } from "../../test-utils/insert-helpers";
import { MockLLMProvider, } from "../../test-utils/mock-provider";
import type { EvalFixture, } from "./corpus";

/** Provider name the eval harness registers its transport under. */
export const EVAL_PROVIDER_NAME = "eval-provider";
/** Eval model id (role overrides point every classifier role at it). */
export const EVAL_MODEL_ID = "eval-model";

/** Isolated eval runtime. */
export interface EvalEnv {
  config: Config;
  db: Kysely<DB>;
  /** Release DB + registry resources. */
  close(): void;
}

/** Transport selection for the eval run. */
export type EvalMode =
  | { transport: "mock" }
  | { transport: "endpoint"; baseUrl: string; model: string; apiKey?: string };

/** Minimal Config stub sufficient for role resolution + prompt resolution. */
function makeEvalConfig(): Config {
  return {
    generation: {
      defaultProvider: EVAL_PROVIDER_NAME,
      defaultModels: { [EVAL_PROVIDER_NAME]: EVAL_MODEL_ID, },
      modelRoles: {},
    },
    templates: { llm: { systemPrompts: {}, }, },
  } as unknown as Config;
}

/**
 * Build the isolated eval environment.
 * @param mode - Mock (deterministic scripted replies) or real endpoint
 * @param corpus - Fixtures; mock mode scripts each fixture's reply by input
 * @returns Ready-to-use env — call `close()` when done
 */
export async function createEvalEnv(mode: EvalMode, corpus: readonly EvalFixture[],): Promise<EvalEnv> {
  const { db, } = await createTestDb();
  unregisterProvider(EVAL_PROVIDER_NAME,);
  if (mode.transport === "mock") {
    const mock = new MockLLMProvider();
    for (const fixture of corpus) {
      mock.setInputReply(fixture.task, fixture.input, fixture.reply,);
    }

    registerProvider(EVAL_PROVIDER_NAME, mock,);
  } else {
    const instance: ProviderInstanceConfig = {
      name: EVAL_PROVIDER_NAME,
      label: "Prompt Eval",
      baseUrl: mode.baseUrl,
      apiKey: mode.apiKey,
      model: mode.model,
      timeout: 10_000,
      retries: 0,
      allowUserApiKey: false,
      models: {},
    };

    registerProvider(EVAL_PROVIDER_NAME, new OpenAiCompatibleProvider(instance,),);
  }

  await insertModelRoleOverrides(db, EVAL_PROVIDER_NAME, EVAL_MODEL_ID, { role: ModelRole.Auxiliary, } as never,);
  await insertModelRoleOverrides(db, EVAL_PROVIDER_NAME, EVAL_MODEL_ID, { role: ModelRole.Classifier, } as never,);
  return {
    config: makeEvalConfig(),
    db,
    close() {
      unregisterProvider(EVAL_PROVIDER_NAME,);
      void db.destroy();
    },
  };
}
