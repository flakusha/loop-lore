// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Layer 2 of the assistant tool guard — the aux-LLM judge.
 *
 * Reviews the tool requests that carry a review-tier capability: does the
 * natural-language wrapper behind the request try to escalate privileges?
 *
 * The judge reuses the shared AUX pipeline exactly like the GM tool detector
 * does — `resolveClassifierPrompt` for the prompt, `callAux` for the call
 * (BYO key parity via `resolveProvider`, 0.0 temperature, ~2s timeout, small
 * token budget, graceful degradation). The `injection-check` classifier is
 * the closest existing task: it already answers "does this text try to
 * change the assistant's behavior or abuse tools", which is the escalation
 * question the guard asks. Its verdict is mapped onto the approval contract
 * below.
 *
 * Never fails open: a timeout, a missing model, or an unparseable answer
 * denies the call.
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../../aux-pipeline";
import { resolveClassifierPrompt, } from "../../aux-pipeline/class-template-resolver";
import type { AuxCallOptions, AuxCallResult, AuxTaskName, } from "../../aux-pipeline/types";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { clampUnit, jsonParseOr, } from "../../utils";

/** Minimum confidence for an approval. Below this the judge denies. */
export const MIN_JUDGE_CONFIDENCE = 0.7;

/** The verdict of the Layer 2 judge. */
export interface JudgeVerdict {
  /** Whether the tool call may proceed. */
  approved: boolean;
  /** Confidence in the approval, in [0, 1]. */
  confidence: number;
  /** Why the judge decided as it did. */
  rationale: string;
  /** Whether the request looked like a privilege-escalation attempt. */
  escalationAttempt: boolean;
  /** Where the verdict came from. */
  source: "aux-llm" | "fallback-deny";
}

/** Request handed to {@link judgeToolCall}. */
export interface JudgeRequest {
  /** Registered command name. */
  tool: string;
  /** Positional arguments the tool would run with. */
  args: string[];
  /** The natural-language wrapper that produced the request. */
  content: string;
  /** The caller's role, for the judge's context. */
  role?: string;
  /** Application config. */
  config: Config;
  /** Kysely instance. */
  db: Kysely<DB>;
  /** User ID for BYO apiKey resolution. */
  userId?: string;
  /** Chat ID for telemetry context. */
  chatId?: string;
  /** Test seam: replaces the AUX call. */
  callAuxFn?: AuxCaller;
}

/** The AUX call shape the judge uses. */
export type AuxCaller = (
  task: AuxTaskName,
  config: Config,
  db: Kysely<DB>,
  messages: { role: "system" | "user"; content: string }[],
  opts?: AuxCallOptions,
) => Promise<AuxCallResult | null>;

/**
 * Parse an AUX answer into a verdict.
 *
 * Accepts the judge's own contract (`approved` / `confidence` /
 * `rationale` / `escalationAttempt`) and the shared injection-check contract
 * (`injected` / `category` / `confidence`). A low confidence always denies.
 * @param content - Raw AUX response text
 * @returns The verdict, or null when the answer is unusable
 */
export function parseJudgeVerdict(content: string,): JudgeVerdict | null {
  const parsed = jsonParseOr<Record<string, unknown>>(content, {},);
  if (typeof parsed.confidence !== "number") { return null; }
  const confidence = clampUnit(parsed.confidence,);

  if (typeof parsed.approved === "boolean") {
    return {
      approved: parsed.approved && confidence >= MIN_JUDGE_CONFIDENCE,
      confidence,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "aux judge verdict",
      escalationAttempt: parsed.escalationAttempt === true,
      source: "aux-llm",
    };
  }

  if (typeof parsed.injected === "boolean") {
    const escalation = parsed.injected;
    const category = typeof parsed.category === "string" ? parsed.category : "none";
    return {
      approved: !escalation && confidence >= MIN_JUDGE_CONFIDENCE,
      confidence: escalation ? 0 : confidence,
      rationale: escalation
        ? `aux judge flagged a privilege-escalation attempt (${category})`
        : `aux judge found no privilege escalation (${category})`,
      escalationAttempt: escalation,
      source: "aux-llm",
    };
  }

  return null;
}

/**
 * Build the message the judge reads.
 * @param req - The judge request
 * @returns The user message, with the tool context in front of the wrapper
 */
function judgeMessage(req: JudgeRequest,): string {
  const args = req.args.length > 0 ? ` ${req.args.join(" ",)}` : "";
  return [
    `Tool requested: /${req.tool}${args}`,
    `Caller role: ${req.role ?? "unknown"}`,
    "",
    "Message:",
    req.content.slice(0, 500,),
  ].join("\n",);
}

/**
 * Judge a tool call with the auxiliary model.
 *
 * @param req - Tool, wrapper text, config, and DB handle
 * @returns The verdict — a timeout or an unusable answer denies the call
 */
export async function judgeToolCall(req: JudgeRequest,): Promise<JudgeVerdict> {
  const { config, db, userId, chatId, } = req;
  const caller = req.callAuxFn ?? callAux;

  let verdict: JudgeVerdict;
  try {
    const { prompt, params, } = await resolveClassifierPrompt({
      config,
      db,
      task: "injection-check",
      chatId,
    },);

    // Deterministic classification: temperature 0 and a small token budget,
    // regardless of what the prompt pack asks for.
    const response = await caller("injection-check", config, db, [
      { role: "system", content: prompt, },
      { role: "user", content: judgeMessage(req,), },
    ], { userId, chatId, ...params, temperature: 0, maxTokens: 100, },);

    if (!response) {
      verdict = {
        approved: false,
        confidence: 0,
        rationale: "aux judge did not answer (no model, timeout, or provider error)",
        escalationAttempt: false,
        source: "fallback-deny",
      };
    } else {
      const parsed = parseJudgeVerdict(response.content,);
      verdict = parsed ?? {
        approved: false,
        confidence: 0,
        rationale: "aux judge returned an unusable answer",
        escalationAttempt: false,
        source: "fallback-deny",
      };
    }
  } catch (error) {
    verdict = {
      approved: false,
      confidence: 0,
      rationale: `aux judge failed: ${(error as Error).message}`,
      escalationAttempt: false,
      source: "fallback-deny",
    };
  }

  getChildLogger("assistant-guard",)?.info("Tool call judged", {
    tool: req.tool,
    approved: verdict.approved,
    confidence: verdict.confidence,
    escalationAttempt: verdict.escalationAttempt,
    source: verdict.source,
  },);

  return verdict;
}
