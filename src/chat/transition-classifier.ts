// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Transition Classifier
 *
 * Regex-first, AUX-LLM-fallback detection for scene/location transitions.
 * Regex covers explicit movement ("I walk to..."), AUX-LLM catches implicit
 * transitions ("The rain forces us to seek shelter").
 *
 * AUX LLM constraints (enforced by the shared aux-pipeline runner):
 * - 50-100 max tokens (JSON response only)
 * - 0.0 temperature (deterministic)
 * - 2s timeout (fail fast, don't block chat)
 * - Graceful degradation on error (no transition detected)
 * - BYO apiKey parity via resolveProvider (user → chat/actor → server)
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../aux-pipeline";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { resolveSystemPrompt, } from "../prompts";
import {
  CONTEXT_CUT,
  MOVEMENT_VERBS,
  SCENE_CHANGE,
  TEMPORAL_TRANSITION,
  TRANSITION_PHRASES,
} from "../regex/transitions";
import { jsonParseOr, } from "../utils";
import type { TransitionClassification, TransitionType, } from "./types";

// ─── Regex Patterns ───────────────────────────────────────────

/**
 * Regex patterns for fast detection.
 * Each pattern maps to a transition type.
 * Order matters: more specific patterns first.
 */
const REGEX_PATTERNS: { pattern: RegExp; type: TransitionType }[] = [
  // Context cut: time skip (check before location change patterns)
  { pattern: CONTEXT_CUT, type: "context_cut", },
  // Context cut: temporal transition
  { pattern: TEMPORAL_TRANSITION, type: "context_cut", },
  // Description: scene description without explicit movement
  { pattern: /\b(describe|describe\s+the|narrate|tell\s+me\s+about)\b/i, type: "description", },
  // Location change: explicit movement verbs
  { pattern: MOVEMENT_VERBS, type: "location_change", },
  // Location change: scene/setting/location shift
  { pattern: SCENE_CHANGE, type: "location_change", },
  // Location change: movement phrases
  { pattern: TRANSITION_PHRASES, type: "location_change", },
  // NOTE (audit B1, 2026-08-25): the previous bare-preposition pattern
  // (/(to|into|toward|inside|outside|through|across|over)s+(thes+)?[a-z]+/i)
  // over-triggered on ordinary narration ("to the store", "into the night"),
  // producing false location_change transitions. Removed; implicit and
  // third-person movement is handled by the AUX-LLM fallback (regex-first).
];

// ─── Regex-First Classification ───────────────────────────────

/**
 * Classify transition using regex patterns (instant, zero cost).
 *
 * @param content - User message content
 * @returns Classification result or null if no pattern matches
 */
function classifyWithRegex(content: string,): Omit<TransitionClassification, "source"> | null {
  const lower = content.toLowerCase();

  for (const { pattern, type, } of REGEX_PATTERNS) {
    if (pattern.test(lower,)) {
      return {
        isTransition: true,
        type,
        confidence: 1,
        locationHint: extractLocationHint(content,),
      };
    }
  }

  return null;
}

// ─── AUX LLM Classification ──────────────────────────────────

/**
 * AUX LLM classification with fast-resolution constraints.
 *
 * @param content - User message content
 * @param recentMessages - Last 1-2 messages for context
 * @param config - Application config
 * @param db - Kysely instance
 * @param userId - User ID for BYO apiKey resolution
 * @returns Classification result or null on failure
 */
async function classifyWithAuxLlm(
  content: string,
  recentMessages: string[],
  config: Config,
  db: Kysely<DB>,
  userId?: string,
): Promise<Omit<TransitionClassification, "source"> | null> {
  // Build minimal context: system + recent messages + current message
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system" as const, content: resolveSystemPrompt(config.templates.llm, "transition",), },
  ];
  for (const m of recentMessages) {
    messages.push({ role: "user" as const, content: m.slice(0, 200,), },);
  }
  messages.push({ role: "user" as const, content, },);

  // Shared AUX policy: 2s timeout, 0.0 temperature, 100 max tokens, BYO key
  const response = await callAux("transition", config, db, messages, {
    userId,
    temperature: 0,
    maxTokens: 100,
  },);
  if (!response) {
    return null;
  }

  // Parse JSON response
  const parsed = jsonParseOr<{
    isTransition?: boolean;
    type?: string;
    confidence?: number;
    locationHint?: string;
  }>(response.content, {},);

  if (!parsed || typeof parsed.isTransition !== "boolean") {
    return null;
  }

  return {
    isTransition: parsed.isTransition,
    type: isValidTransitionType(parsed.type,) ? parsed.type : null,
    confidence: parsed.confidence ?? 0.5,
    locationHint: parsed.locationHint ?? null,
  };
}

// ─── Main Classification Function ─────────────────────────────

/**
 * Classify whether a message is a transition.
 * Regex-first, AUX-LLM-fallback for missed cases.
 *
 * @param content - User message content
 * @param recentMessages - Last 1-2 messages for context (optional)
 * @param config - Application config
 * @param db - Kysely instance
 * @param userId - User ID for BYO apiKey resolution (optional)
 * @returns Transition classification
 */
export async function classifyTransition(
  content: string,
  recentMessages: string[],
  config: Config,
  db: Kysely<DB>,
  userId?: string,
): Promise<TransitionClassification> {
  // Step 1: Regex check (instant, zero cost)
  const regexResult = classifyWithRegex(content,);
  if (regexResult) {
    return { ...regexResult, source: "regex", };
  }

  // Step 2: AUX LLM fallback (fast, low cost)
  try {
    const auxResult = await classifyWithAuxLlm(content, recentMessages, config, db, userId,);
    if (auxResult) {
      return { ...auxResult, source: "aux-llm", };
    }
  } catch {
    // AUX unavailable — proceed with no transition
    getLogger()
      .child({ module: "transition-classifier", },)
      .debug("AUX LLM classification failed, falling back to no transition",);
  }

  // Step 3: No transition detected
  return {
    isTransition: false,
    type: null,
    confidence: 0,
    locationHint: null,
    source: "none",
  };
}

// ─── Helpers ──────────────────────────────────────────────────

const TRANSITION_TYPES = new Set<TransitionType>([
  "location_change",
  "context_cut",
  "description",
],);

/**
 * Check if a string is a valid transition type.
 */
function isValidTransitionType(t: unknown,): t is TransitionType {
  return TRANSITION_TYPES.has(t as TransitionType,);
}

/**
 * Extract location hint from message content.
 * Simple heuristic: extract text after movement prepositions.
 */
function extractLocationHint(content: string,): string | null {
  const match = /(?:to|into|toward|inside|outside)\s+(.+?)(?:\.|,|$)/i.exec(content,);
  return match?.[1]?.trim() ?? null;
}
