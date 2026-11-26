// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Decision-model transport (`POST /v1/systemone`)
 *
 * Native non-generative classifier transport for llama.cpp decision models
 * (llama.cpp PR #29818): typed `choice` / `score` / `noul` questions answered
 * with probabilities and zero generated text.
 *
 * Graceful contract (same as `callAux`): any failure — network, timeout,
 * non-2xx (400 invalid, 501 not-a-decision-model, 502 proxy), unparseable or
 * invalid body — resolves `null`, never throws. The caller falls back to the
 * generative auxiliary path.
 */
import { getChildLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";

/** One typed question in a decision request. */
export type DecisionQuestion =
  | {
    readonly id: string;
    readonly type: "choice";
    readonly instructions: string;
    /** Option key → description (`null` for a bare label). */
    readonly criteria: Readonly<Record<string, string | null>>;
  }
  | {
    readonly id: string;
    readonly type: "score";
    readonly instructions: string;
    /** 2–10 level descriptions, lowest first. Upstream field: `criteria`. */
    readonly criteria: readonly string[];
  }
  | {
    readonly id: string;
    readonly type: "noul";
    readonly instructions: string;
    /** Optional true/false descriptions, keyed by those names upstream. */
    readonly criteria?: Readonly<Record<string, string | null>>;
  };

/** Validated answers keyed by question id. */
export interface DecisionAnswers {
  readonly [id: string]: {
    readonly type: "choice" | "score" | "noul";
    readonly choice?: string;
    readonly probabilities?: Readonly<Record<string, number>>;
    readonly confidence?: number;
    readonly score?: number;
    readonly noul?: number;
  };
}

/** Validated `POST /v1/systemone` response. */
export interface DecisionResponse {
  readonly model: string;
  readonly answers: DecisionAnswers;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** Options for {@link callDecisionModel}. All fields required except timeout/fetch. */
export interface DecisionCallOptions {
  /** Provider base URL (e.g. `http://localhost:7180/v1`); loopback only. */
  readonly baseUrl: string;
  /** Decision model id, pinned per model (cutoffs are model-specific). */
  readonly model: string;
  /** Conversation state: string, object, or chat-message array. */
  readonly state: unknown;
  readonly questions: readonly DecisionQuestion[];
  /** Per-request timeout in ms. Default: 2000. */
  readonly timeoutMs?: number;
  /** Injectable fetch for tests. Default: global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2000;

/** Loopback hosts: the decision endpoint is a local unauthenticated server. */
function isLoopback(url: string,): boolean {
  let host = "";
  try {
    host = new URL(url,).hostname.toLowerCase();
  } catch {
    return false;
  }

  // WHATWG URL keeps the brackets on IPv6 literals: `http://[::1]` → `[::1]`.
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function isFiniteProb(n: unknown,): n is number {
  return typeof n === "number" && Number.isFinite(n,) && n >= 0 && n <= 1;
}

/**
 * Validate a decision response against the questions that were asked.
 * @param body - Parsed response JSON
 * @param questions - Questions from the matching request
 * @returns Validated response, or null when the body is not a usable answer set
 */
export function validateDecisionResponse(
  body: unknown,
  questions: readonly DecisionQuestion[],
): DecisionResponse | null {
  if (typeof body !== "object" || body === null) { return null; }
  const { model, answers, usage, } = body as Record<string, unknown>;
  if (typeof model !== "string" || typeof answers !== "object" || answers === null) {
    return null;
  }

  const out: Record<string, DecisionAnswers[string]> = {};
  for (const q of questions) {
    const a = (answers as Record<string, unknown>)[q.id];
    if (typeof a !== "object" || a === null) { return null; }
    const ans = a as Record<string, unknown>;
    if (ans["type"] !== q.type) { return null; }
    if (q.type === "choice") {
      const choice = ans["choice"];
      const probs = ans["probabilities"];
      if (typeof choice !== "string" || !(choice in q.criteria)) { return null; }
      if (typeof probs !== "object" || probs === null) { return null; }
      for (const v of Object.values(probs as Record<string, unknown>,)) {
        if (!isFiniteProb(v,)) { return null; }
      }

      const conf = ans["confidence"];
      if (conf !== undefined && !isFiniteProb(conf,)) { return null; }
      out[q.id] = {
        type: "choice",
        choice,
        probabilities: probs as Record<string, number>,
        ...(conf === undefined ? {} : { confidence: conf as number, }),
      };
    } else if (q.type === "score") {
      const score = ans["score"];
      const probs = ans["probabilities"];
      if (typeof score !== "number" || !Number.isFinite(score,)) { return null; }
      if (typeof probs !== "object" || probs === null) { return null; }
      for (const v of Object.values(probs as Record<string, unknown>,)) {
        if (!isFiniteProb(v,)) { return null; }
      }

      out[q.id] = { type: "score", score, probabilities: probs as Record<string, number>, };
    } else {
      const noul = ans["noul"];
      if (!isFiniteProb(noul,)) { return null; }
      out[q.id] = { type: "noul", noul, };
    }
  }

  const u = (usage ?? {}) as Record<string, unknown>;
  // llama.cpp answers snake_case `input_tokens`; accept the camel-joined
  // alias too so a proxy-normalized body validates the same way.
  const promptTokens = u["prompt_tokens"] ?? u["input_tokens"];
  const completionTokens = u["completion_tokens"] ?? u["output_tokens"];
  return {
    model,
    answers: out,
    promptTokens: typeof promptTokens === "number" ? promptTokens : 0,
    completionTokens: typeof completionTokens === "number" ? completionTokens : 0,
  };
}

/**
 * Ask a decision model. Resolves `null` on any failure — the caller keeps the
 * generative path. A refusal (e.g. 501, not a decision model) is debug-logged
 * with the model id so a mis-declared GGUF does not look like generic degradation.
 * @param opts - Endpoint, model, state, and questions
 * @returns Validated response, or null on any failure
 */
export async function callDecisionModel(
  opts: DecisionCallOptions,
): Promise<DecisionResponse | null> {
  const { baseUrl, model, state, questions, timeoutMs = DEFAULT_TIMEOUT_MS, } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!isLoopback(baseUrl,)) {
    getChildLogger("aux-pipeline",)?.warn("Decision endpoint is not loopback", { baseUrl, },);
    return null;
  }

  const url = `${baseUrl.replace(/\/+$/, "",)}/systemone`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs,);
  timer.unref?.();
  // Upstream expects `questions` as an object keyed by question name, not an
  // array with an `id` field. Answers come back keyed by the same name.
  const namedQuestions: Record<string, unknown> = {};
  for (const q of questions) {
    const { id, ...body } = q;
    namedQuestions[id] = body;
  }

  const serialized = safeJsonStringify({ model, state, questions: namedQuestions, },);
  if (!serialized.ok) { return null; }
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: serialized.value,
      signal: ctrl.signal,
    },);

    if (!res.ok) {
      getChildLogger("aux-pipeline",)?.debug("Decision endpoint refused", {
        model,
        status: res.status,
      },);

      return null;
    }

    const body: unknown = await res.json();
    return validateDecisionResponse(body, questions,);
  } catch {
    return null;
  } finally {
    clearTimeout(timer,);
  }
}
