// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Decision question registry
 *
 * Builds `choice` questions from the classification-task registry: the
 * declared label vocabulary becomes the option set, so a decision model
 * picks from exactly the labels the generative path would parse.
 * Text-only state: images are stripped (the local proxy 502s image payloads
 * on the decision path while vision works over chat completions), and the
 * generative fallback keeps vision coverage.
 */
import type { Config, } from "../config/schema";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { callDecisionModel, } from "./decision-client";
import type { DecisionQuestion, } from "./decision-client";
import { AUX_CLASSIFICATION_TASKS, } from "./template-registry";
import type { AuxTaskName, } from "./types";

/** Largest option set a decision model accepts (laya/clef/vllm-d3 ceiling). */
export const MAX_DECISION_OPTIONS = 255;

/**
 * Build a `choice` question for a task, or null when the task has no
 * decision-shaped vocabulary (not classifier-preferring, or fewer than 2
 * labels, or more options than any decision model accepts).
 * @param task - AUX task to build the question for
 * @returns Choice question, or null when the task is not decision-shaped
 */
export function buildChoiceQuestion(task: AuxTaskName,): DecisionQuestion | null {
  const def = AUX_CLASSIFICATION_TASKS[task];
  if (!def.preferClassifier) { return null; }
  if (def.labels.length < 2 || def.labels.length > MAX_DECISION_OPTIONS) { return null; }
  const criteria: Record<string, string | null> = {};
  for (const label of def.labels) { criteria[label] = null; }
  return {
    id: task,
    type: "choice",
    instructions: def.purpose ?? task,
    criteria,
  };
}

/** Minimal chat-message shape the decision endpoint accepts as state. */
export interface DecisionStateMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

/**
 * Project AUX messages onto decision state: character turns read as
 * assistant, tool turns as user; images are dropped (see module note).
 * @param messages - AUX conversation messages
 * @returns Text-only state messages
 */
export function decisionStateFromMessages(
  messages: readonly GenerationMessage[],
): DecisionStateMessage[] {
  return messages
    .filter((m,) => m.content.length > 0)
    .map((m,) => ({
      role: m.role === "system" || m.role === "user" || m.role === "assistant"
        ? m.role
        : m.role === "character"
        ? "assistant"
        : "user",
      content: m.content,
    }));
}

/**
 * Find the OpenAI-compatible base URL for a provider instance by name.
 * @param config - Application config
 * @param providerName - Resolved provider instance name
 * @returns Base URL (e.g. `http://localhost:7180/v1`), or null when unconfigured
 */
export function findDecisionBaseUrl(
  config: Config,
  providerName: string,
): string | null {
  const entries = config.generation?.providers?.openaiCompatible;
  if (!entries) { return null; }
  return entries.find((e,) => e.name === providerName)?.baseUrl ?? null;
}

/** Options for {@link tryDecisionTransport}. */
export interface DecisionTransportRequest {
  readonly task: AuxTaskName;
  readonly config: Config;
  /** Resolved classifier role (only provider + model are read). */
  readonly auxRole: { readonly provider: string; readonly model: string };
  readonly messages: readonly GenerationMessage[];
  readonly timeoutMs: number;
}

/** Decision-transport result (latency is stamped by the caller). */
export interface DecisionTransportResult {
  readonly content: string;
  readonly model: string;
  readonly provider: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/**
 * Try the decision-model transport for one AUX call.
 *
 * Only fires when the task has a decision-shaped vocabulary and the
 * classifier provider carries an OpenAI-compatible base URL; everything
 * else (including a 501 from a non-decision model) resolves null and the
 * caller keeps the generative path.
 * @param req - Task, config, role, messages, and timeout
 * @returns Result sans latency, or null when the transport does not apply
 */
export async function tryDecisionTransport(
  req: DecisionTransportRequest,
): Promise<DecisionTransportResult | null> {
  const question = buildChoiceQuestion(req.task,);
  if (!question) { return null; }
  const baseUrl = findDecisionBaseUrl(req.config, req.auxRole.provider,);
  if (!baseUrl) { return null; }
  const response = await callDecisionModel({
    baseUrl,
    model: req.auxRole.model,
    state: decisionStateFromMessages(req.messages,),
    questions: [question,],
    timeoutMs: req.timeoutMs,
  },);

  const answer = response?.answers[req.task];
  if (!response || answer?.type !== "choice" || !answer.choice) { return null; }
  return {
    content: answer.choice,
    model: response.model,
    provider: req.auxRole.provider,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
  };
}
