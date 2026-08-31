// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Tool Detection
 *
 * AUX-LLM detection for when a user requests GM tool execution in a
 * GM-mode chat. Feeds into the assistant command execution pipeline so
 * natural-language tool requests ("roll a d20", "check my stats") route
 * to the same handlers as slash commands (/roll, /stats).
 *
 * AUX LLM constraints (enforced by the shared aux-pipeline runner):
 * - 50-100 max tokens (JSON response only)
 * - 0.0 temperature (deterministic)
 * - 2s timeout (fail fast, don't block chat)
 * - Graceful degradation on error (no tool detected)
 * - BYO apiKey parity via resolveProvider (user → chat/actor → server)
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../aux-pipeline";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { resolveSystemPrompt, } from "../prompts";
import { clampUnit, jsonParseOr, } from "../utils";

/** GM tool names the detector may resolve to. */
export const GM_TOOL_NAMES = [
  "roll_dice",
  "check_stats",
  "generate_npc",
  "generate_item",
  "modify_world",
  "trigger_event",
  "summarize",
  "none",
] as const;

/** A single GM tool name. `"none"` means no tool was requested. */
export type GmToolName = (typeof GM_TOOL_NAMES)[number];

/** Parsed result of GM tool detection. */
export interface GmToolDetection {
  /** Whether a tool was requested (false when name is "none"). */
  requested: boolean;
  /** Detected tool name, or "none". */
  name: GmToolName;
  /** Tool parameters extracted from the message. */
  params: Record<string, unknown>;
  /** Model confidence (0.0–1.0). */
  confidence: number;
  /** Detection source: "aux-llm" on success, "none" on failure/no tool. */
  source: "aux-llm" | "none";
}

const VALID_TOOL_NAMES = new Set<string>(GM_TOOL_NAMES,);

/**
 * Parse and validate a raw AUX-LLM JSON response into a {@link GmToolDetection}.
 *
 * Pure and side-effect free — unit-testable without a live provider.
 * @param content - Raw LLM response text
 * @returns Detection, or null if the response is malformed or the tool name is unknown
 * @example
 * parseGmToolDetection('{"toolCall":{"name":"roll_dice","params":{"dice":"d20"},"confidence":0.9}}')
 * // { requested: true, name: "roll_dice", params: { dice: "d20" }, confidence: 0.9, source: "aux-llm" }
 */
export function parseGmToolDetection(content: string,): GmToolDetection | null {
  const parsed = jsonParseOr<{ toolCall?: { name?: unknown; params?: unknown; confidence?: unknown } }>(
    content,
    {},
  );
  const toolCall = parsed.toolCall;
  if (!toolCall || typeof toolCall !== "object") { return null; }

  const name = typeof toolCall.name === "string" ? toolCall.name : "";
  if (!VALID_TOOL_NAMES.has(name,)) { return null; }

  const params = toolCall.params && typeof toolCall.params === "object" && !Array.isArray(toolCall.params,)
    ? (toolCall.params as Record<string, unknown>)
    : {};
  // Confidence is contractually `[0, 1]`; clamp out-of-range values and fall
  // back to 0.5 for non-finite input so downstream heuristics that branch on
  // confidence thresholds cannot be tricked by prompt-injected tool-result JSON.
  const rawConfidence = typeof toolCall.confidence === "number" ? toolCall.confidence : 0.5;

  return {
    requested: name !== "none",
    name: name as GmToolName,
    params,
    confidence: clampUnit(rawConfidence,),
    source: "aux-llm",
  };
}

/**
 * Detect a GM tool request in a user message via the auxiliary model.
 * @param content - User message text
 * @param config - Application config
 * @param db - Kysely instance
 * @param userId - User ID for BYO apiKey resolution
 * @param chatId - Chat ID for telemetry context
 * @returns Detection, or null on any failure (no AUX role, timeout, parse error)
 */
export async function detectGmTool(
  content: string,
  config: Config,
  db: Kysely<DB>,
  userId?: string,
  chatId?: string,
): Promise<GmToolDetection | null> {
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system" as const, content: resolveSystemPrompt(config.templates.llm, "gmTool",), },
    { role: "user" as const, content: content.slice(0, 500,), },
  ];

  // Shared AUX policy: 2s timeout, 0.0 temperature, 100 max tokens, BYO key
  const response = await callAux("gm-tool", config, db, messages, {
    userId,
    chatId,
    temperature: 0,
    maxTokens: 100,
  },);
  if (!response) { return null; }

  const detection = parseGmToolDetection(response.content,);
  if (!detection) {
    getLogger()
      .child({ module: "gm-tool-detection", },)
      .debug("AUX LLM returned an unparseable GM tool detection, treating as none",);
    return null;
  }

  return detection;
}
