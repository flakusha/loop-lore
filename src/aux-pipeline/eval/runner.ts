// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Prompt-Eval Runner
 *
 * Executes each corpus fixture through the REAL classifier functions
 * (classifyIntent, detectNsfwWithLlm, classifyTransition, detectGmTool,
 * confirmInjectionWithLlm) against the eval environment's provider, then
 * scores per-task accuracy and parse-null rate. Deterministic in mock mode.
 */
import { detectGmTool, } from "../../assistant/gm-tool-detection";
import { classifyTransition, } from "../../chat/transition-classifier";
import { classifyIntent, } from "../../generation/auto-gen/classify-intent";
import { detectNsfwWithLlm, } from "../../generation/hooks/nsfw-classifier";
import type { HookContext, } from "../../generation/hooks/types";
import { confirmInjectionWithLlm, } from "../../validation/prompt-injection";
import { callAux, } from "../index";
import type { AuxTaskName, } from "../types";
import { EVAL_TASKS, type EvalFixture, } from "./corpus";
import type { EvalEnv, } from "./env";
import { type FixtureResult, scoreTask, type TaskReport, } from "./score";

/** Extract the comparable label from a classifier outcome, per task. */
const LABEL_EXTRACTORS = {
  intent: (d: unknown,): string | null => (d as { intent: string } | null)?.intent ?? null,
  nsfw: (level: unknown,): string | null => (level as string | null) ?? null,
  transition: (d: unknown,): string | null => {
    const parsed = d as { isTransition: boolean; type: string | null } | null;
    if (!parsed) { return null; }
    return `${parsed.isTransition}:${parsed.type ?? "null"}`;
  },
  "gm-tool": (d: unknown,): string | null => (d as { name: string } | null)?.name ?? null,
  "injection-check": (
    v: unknown,
  ): string | null => (v === null ? null : `injected:${(v as { injected: boolean }).injected}`),
};

/**
 * Run one fixture through its task's classifier.
 * @param fixture - Corpus fixture
 * @param env - Eval environment
 * @returns Extracted label, or null when the classifier degraded to null
 */
async function classifyFixture(fixture: EvalFixture, env: EvalEnv,): Promise<string | null> {
  const { config, db, } = env;
  switch (fixture.task) {
    case "intent": {
      return LABEL_EXTRACTORS.intent(await classifyIntent(fixture.input, config, db,),);
    }
    case "nsfw": {
      const context: HookContext = {
        chatId: "eval-chat",
        actorId: "eval-actor",
        userId: "eval-user",
        content: fixture.input,
        config,
        nsfwConfig: {
          allowNsfw: true,
          nsfwMinAge: 18,
          defaultNsfwScope: "chat",
          consentRequired: true,
          auditLogging: false,
          useLlmClassifier: true,
        },
        db,
      };
      return LABEL_EXTRACTORS.nsfw(await detectNsfwWithLlm(fixture.input, context, callAux,),);
    }
    case "transition": {
      return LABEL_EXTRACTORS.transition(await classifyTransition(fixture.input, [], config, db,),);
    }
    case "gm-tool": {
      return LABEL_EXTRACTORS["gm-tool"](await detectGmTool(fixture.input, config, db,),);
    }
    case "injection-check": {
      const verdict = await confirmInjectionWithLlm(fixture.input, { config, db, },);
      return LABEL_EXTRACTORS["injection-check"](verdict,);
    }
    default: {
      return null;
    }
  }
}

/**
 * Run the full corpus and score per task.
 * @param env - Eval environment (mock mode ⇒ deterministic)
 * @param corpus - Fixtures to evaluate (defaults to the built-in corpus)
 * @param tasks - Report order (defaults to corpus task order)
 * @returns Per-task reports in stable order
 */
export async function runPromptEval(
  env: EvalEnv,
  corpus: readonly EvalFixture[] = [],
  tasks: readonly AuxTaskName[] = EVAL_TASKS,
): Promise<TaskReport[]> {
  const fixtures = corpus.length > 0 ? corpus : (await import("./corpus")).EVAL_CORPUS;
  const reports: TaskReport[] = [];
  for (const task of tasks) {
    const results: FixtureResult[] = [];
    for (const fixture of fixtures.filter((f,) => f.task === task)) {
      results.push({ expected: fixture.expected, actual: await classifyFixture(fixture, env,), },);
    }
    if (results.length > 0) {
      reports.push(scoreTask(task, results,),);
    }
  }
  return reports;
}
