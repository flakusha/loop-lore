// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt/Message Injection Validation
 *
 * Two-step gate: (1) a deterministic, pure signal scan — cheap enough for the
 * message-submit hot path; (2) an aux-LLM classifier confirm, run only when
 * the scan is suspicious. A heuristic alone never blocks: blocking requires
 * both steps to agree.
 */
import type { Kysely, } from "kysely";
import { INJECTION_CHECK_PROMPT, } from "../aux-pipeline/prompts";
import { callAux, } from "../aux-pipeline/runner";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { safeJsonParse, } from "../utils";

/** Injection categories, matching the LLM classifier taxonomy. */
export type InjectionCategory =
  | "instruction_override"
  | "role_hijack"
  | "delimiter_smuggle"
  | "exfiltration";

/** Verdict of the two-step check. */
export type InjectionVerdict = "clean" | "suspicious" | "blocked";

/** Result of the full check. */
export interface InjectionCheck {
  verdict: InjectionVerdict;
  score: number;
  signals: string[];
  /** Present only when the scan was suspicious and the LLM step ran. */
  llm?: { injected: boolean; confidence: number; category: InjectionCategory | "none" };
}

interface InjectionSignal {
  id: string;
  weight: number;
  pattern: RegExp;
}

/**
 * Weighted injection vectors. Weights sum into a suspicion score;
 * ≥ SUSPECT_THRESHOLD escalates to the LLM confirm, ≥ BLOCK_THRESHOLD (with
 * LLM agreement) blocks.
 */
const INJECTION_SIGNALS: InjectionSignal[] = [
  {
    id: "instruction_override",
    weight: 3,
    pattern:
      /\b(ignore|disregard|forget|override|bypass)\b[^.!?]{0,40}\b(all\s+)?(previous|prior|earlier|above|your)\b[^.!?]{0,20}\b(instructions?|rules?|directions?|prompts?|constraints?|guidelines?)\b/i,
  },
  {
    id: "instruction_override",
    weight: 2,
    pattern: /\b(new|real|actual|hidden|true)\s+(instructions?|directives?|rules?)\b/i,
  },
  {
    id: "role_hijack",
    weight: 3,
    pattern:
      /\b(you are now|act as(?! a character)|pretend to be (the )?(system|developer|admin)|from now on,? you)\b/i,
  },
  {
    id: "role_hijack",
    weight: 2,
    pattern: /\b(system|developer|assistant)\s*(prompt|message|instructions?)\s*:/i,
  },
  {
    id: "delimiter_smuggle",
    weight: 3,
    pattern: /<\/?(system|assistant|developer|tool(_|\.|-)result|im_start|im_end)>/i,
  },
  {
    id: "delimiter_smuggle",
    weight: 2,
    pattern: /(im_start|im_end|<\|(system|im_start|im_end|endoftext)\|>)/i,
  },
  {
    id: "exfiltration",
    weight: 3,
    pattern:
      /\b(print|reveal|show|repeat|output|leak|expose)\b[^.!?]{0,30}\b(your|the)\b[^.!?]{0,15}\b(system prompt|instructions?|initial prompt|api key|secret)\b/i,
  },
  {
    id: "exfiltration",
    weight: 2,
    pattern: /\bwhat (is|are) your (system prompt|instructions|initial directive)/i,
  },
  {
    id: "tool_abuse",
    weight: 2,
    pattern: /\b(call|invoke|execute|run)\b[^.!?]{0,25}\b(tool|function|api)\b[^.!?]{0,30}\b(without|bypass|skip)\b/i,
  },
];

/** Zero-width / homoglyph smuggling markers (payload obfuscation). */
const OBFUSCATION_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/;

const SUSPECT_THRESHOLD = 2;
const BLOCK_SCORE_THRESHOLD = 5;
const BLOCK_LLM_CONFIDENCE = 0.8;
const INJECTION_TIMEOUT_MS = 2000;

const MAX_INJECTION_INPUT_CHARS = 4000;

/**
 * @returns child logger tagged with `module: "validation/prompt-injection"` for structured logging.
 */
function getLog() {
  return getLogger().child({ module: "validation/prompt-injection", },);
}

/**
 * Deterministic step 1: scan the text for injection vectors.
 * Pure function — no I/O, safe on the message-submit hot path.
 * @param text - candidate user-supplied text
 * @returns `{ score, signals }` — weighted score (`number`) and the matched signal ids.
 */
export function detectInjectionSignals(text: string,): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  for (const signal of INJECTION_SIGNALS) {
    if (signal.pattern.test(text,)) {
      score += signal.weight;
      if (!signals.includes(signal.id,)) { signals.push(signal.id,); }
    }
  }
  if (OBFUSCATION_PATTERN.test(text,)) {
    score += 1;
    if (!signals.includes("obfuscation",)) { signals.push("obfuscation",); }
  }
  return { score, signals, };
}

/**
 * Non-deterministic step 2: aux-LLM injection confirm. Runs only when the
 * deterministic scan raised suspicion; null on any failure (timeout, no
 * aux model configured) — the caller then falls back to the scan verdict.
 * @param text - candidate user-supplied text (truncated to `MAX_INJECTION_INPUT_CHARS`)
 * @param options - `config`, `db` required; `userId`/`chatId` optional telemetry context
 * @param options.config - app config (resolved aux-LLM provider)
 * @param options.db - Kysely DB handle (used by aux-pipeline telemetry)
 * @param options.userId - optional user id for telemetry
 * @param options.chatId - optional chat id for telemetry
 * @returns parsed verdict `{ injected, confidence, category }`, or `null` when the aux LLM is unavailable / returns nothing.
 */
export async function confirmInjectionWithLlm(
  text: string,
  options: { config: Config; db: Kysely<DB>; userId?: string; chatId?: string },
): Promise<{ injected: boolean; confidence: number; category: InjectionCategory | "none" } | null> {
  const result = await callAux("injection-check", options.config, options.db, [
    { role: "system", content: INJECTION_CHECK_PROMPT, },
    { role: "user", content: text.slice(0, MAX_INJECTION_INPUT_CHARS,), },
  ], {
    timeoutMs: INJECTION_TIMEOUT_MS,
    userId: options.userId,
    chatId: options.chatId,
  },);
  if (!result) { return null; }
  return parseInjectionVerdict(result.content,);
}

/**
 * Full two-step check. Deterministic scan always runs; the LLM confirm runs
 * only when score ≥ suspicion threshold. Block requires BOTH steps to agree
 * (strong scan score AND classifier confidence ≥ 0.8) — a heuristic alone
 * never blocks. LLM-unavailable degrades to `suspicious`.
 * @param text - candidate user-supplied text
 * @param options - same shape as {@link confirmInjectionWithLlm}
 * @param options.config - app config
 * @param options.db - Kysely DB handle
 * @param options.userId - optional user id for telemetry
 * @param options.chatId - optional chat id for telemetry
 * @returns `InjectionCheck` with `verdict` (`"clean"` / `"suspicious"` / `"blocked"`), `score`, `signals`, and optional `llm` confirmation.
 */
export async function checkPromptInjection(
  text: string,
  options: { config: Config; db: Kysely<DB>; userId?: string; chatId?: string },
): Promise<InjectionCheck> {
  const { score, signals, } = detectInjectionSignals(text,);
  if (score < SUSPECT_THRESHOLD) {
    return { verdict: "clean", score, signals, };
  }
  const llm = await confirmInjectionWithLlm(text, options,);
  if (!llm) {
    getLog().debug("Injection LLM confirm unavailable — scan verdict stands", { score, signals, },);
    return { verdict: "suspicious", score, signals, };
  }
  const blocked = score >= BLOCK_SCORE_THRESHOLD && llm.injected && llm.confidence >= BLOCK_LLM_CONFIDENCE;
  return {
    verdict: blocked ? "blocked" : "suspicious",
    score,
    signals,
    llm,
  };
}

/**
 * Parse the classifier JSON, clamping confidence and narrowing category.
 * Malformed/injected output never yields a `blocked`-enabling shape.
 * @param raw - raw classifier output string (may contain extra prose around the JSON)
 * @returns `{ injected, confidence, category }` with confidence clamped to `[0, 1]` and category narrowed to known values, or `null` when the JSON is missing/malformed or fields are wrong types.
 */
export function parseInjectionVerdict(
  raw: string,
): { injected: boolean; confidence: number; category: InjectionCategory | "none" } | null {
  const start = raw.indexOf("{",);
  const end = raw.lastIndexOf("}",);
  if (start < 0 || end <= start) { return null; }
  const parsed = safeJsonParse(raw.slice(start, end + 1,),);
  if (!parsed.ok) { return null; }
  const value = parsed.value;
  if (typeof value !== "object" || value === null) { return null; }
  const obj = value as Record<string, unknown>;
  const injected = obj.injected;
  if (typeof injected !== "boolean") { return null; }
  const category = obj.category;
  if (
    category !== "instruction_override" &&
    category !== "role_hijack" &&
    category !== "delimiter_smuggle" &&
    category !== "exfiltration" &&
    category !== "none"
  ) {
    return null;
  }
  return { injected, category, confidence: clamp01(obj.confidence,), };
}

/**
 * @param value - value to clamp (any; only finite numbers pass through)
 * @returns `value` clamped to `[0, 1]` if it is a finite number; `0` for non-numbers / `NaN` / `Infinity`.
 */
function clamp01(value: unknown,): number {
  return typeof value === "number" && Number.isFinite(value,) ? Math.min(1, Math.max(0, value,),) : 0;
}
