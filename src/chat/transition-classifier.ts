/**
 * Transition Classifier
 *
 * Regex-first, AUX-LLM-fallback detection for scene/location transitions.
 * Regex covers explicit movement ("I walk to..."), AUX-LLM catches implicit
 * transitions ("The rain forces us to seek shelter").
 *
 * AUX LLM constraints:
 * - 50-100 max tokens (JSON response only)
 * - 0.0 temperature (deterministic)
 * - 2s timeout (fail fast, don't block chat)
 * - Graceful degradation on error (no transition detected)
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { resolveModelRole, } from "../admin/model-roles";
import { getProvider, } from "../generation/providers/registry";
import { getLogger, } from "../logger";
import type { TransitionClassification, TransitionType, } from "./types";

// ─── Regex Patterns ───────────────────────────────────────────

/**
 * Regex patterns for fast detection.
 * Each pattern maps to a transition type.
 * Order matters: more specific patterns first.
 */
const REGEX_PATTERNS: { pattern: RegExp; type: TransitionType }[] = [
  // Context cut: time skip (check before location change patterns)
  { pattern: /\b(context\s*cut|skip\s*(ahead|forward|time))\b/i, type: "context_cut", },
  // Context cut: temporal transition
  { pattern: /\b(after\s+(a\s+)?(while|moment|few\s+minutes|long\s+journey|hours|days))\b/i, type: "context_cut", },
  // Description: scene description without explicit movement
  { pattern: /\b(describe|describe\s+the|narrate|tell\s+me\s+about)\b/i, type: "description", },
  // Location change: explicit movement verbs
  { pattern: /\b(i|we|you)\s+(walk|move|go|travel|head|enter|leave|exit|arrive|reach|venture)\b/i, type: "location_change", },
  // Location change: scene/setting/location shift
  { pattern: /\b(scene|setting|location)\s+(shifts?|changes?|moves?|transitions?)\b/i, type: "location_change", },
  // Location change: movement phrases
  { pattern: /\b(let'?s?\s+go\s+to|heading\s+to|arriving?\s+at|going\s+to)\b/i, type: "location_change", },
  // Location change: prepositional movement (check last - too broad)
  { pattern: /\b(to|into|toward|inside|outside|through|across|over)\s+(the\s+)?[a-z]+\b/i, type: "location_change", },
];

// ─── System Prompt ────────────────────────────────────────────

const TRANSITION_CLASSIFIER_PROMPT = `You are a transition detector. Analyze whether the user message
narrates a scene/location change in a roleplay chat.

Reply with ONLY a JSON object:
{
  "isTransition": true/false,
  "type": "location_change" | "context_cut" | "description" | null,
  "confidence": 0.0-1.0,
  "locationHint": "extracted location name or null"
}

Rules:
- "location_change" = character moves to a new place
- "context_cut" = time skip or scene break
- "description" = narrative transition without explicit movement
- null = not a transition

Examples:
- "I walk to the tavern" → isTransition: true, type: "location_change"
- "The rain forces us inside" → isTransition: true, type: "location_change"
- "Skip to morning" → isTransition: true, type: "context_cut"
- "I draw my sword" → isTransition: false
- "Tell me about the quest" → isTransition: false`;

// ─── Regex-First Classification ───────────────────────────────

/**
 * Classify transition using regex patterns (instant, zero cost).
 *
 * @param content - User message content
 * @returns Classification result or null if no pattern matches
 */
function classifyWithRegex(content: string): Omit<TransitionClassification, "source"> | null {
  const lower = content.toLowerCase();

  for (const { pattern, type, } of REGEX_PATTERNS) {
    if (pattern.test(lower,)) {
      return {
        isTransition: true,
        type,
        confidence: 1.0,
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
 * @returns Classification result or null on failure
 */
async function classifyWithAuxLlm(
  content: string,
  recentMessages: string[],
  config: Config,
  db: Kysely<DB>,
): Promise<Omit<TransitionClassification, "source"> | null> {
  // Resolve auxiliary model role
  const auxRole = await resolveModelRole("auxiliary", config, db,);
  if (!auxRole.provider || !auxRole.model) {
    return null;
  }

  const provider = getProvider(auxRole.provider,);
  if (!provider) {
    return null;
  }

  // Build minimal context: system + recent messages + current message
  const messages = [
    { role: "system" as const, content: TRANSITION_CLASSIFIER_PROMPT, },
    ...recentMessages.map((m,) => ({
      role: "user" as const,
      content: m.slice(0, 200,),
    })),
    { role: "user" as const, content, },
  ];

  // Call with timeout
  const response = await withTimeout(
    provider.complete({
      model: auxRole.model,
      messages,
      params: {
        temperature: 0.0,
        maxTokens: 100,
      },
    },),
    2000,
  );

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
 * @returns Transition classification
 */
export async function classifyTransition(
  content: string,
  recentMessages: string[],
  config: Config,
  db: Kysely<DB>,
): Promise<TransitionClassification> {
  // Step 1: Regex check (instant, zero cost)
  const regexResult = classifyWithRegex(content,);
  if (regexResult) {
    return { ...regexResult, source: "regex", };
  }

  // Step 2: AUX LLM fallback (fast, low cost)
  try {
    const auxResult = await classifyWithAuxLlm(content, recentMessages, config, db,);
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

/**
 * Check if a string is a valid transition type.
 */
function isValidTransitionType(t: unknown,): t is TransitionType {
  return t === "location_change" || t === "context_cut" || t === "description";
}

/**
 * Extract location hint from message content.
 * Simple heuristic: extract text after movement prepositions.
 */
function extractLocationHint(content: string,): string | null {
  const match = content.match(/(?:to|into|toward|inside|outside)\s+(.+?)(?:\.|,|$)/i,);
  return match?.[1]?.trim() ?? null;
}

/**
 * Parse JSON with fallback.
 */
function jsonParseOr<T,>(text: string, fallback: T,): T {
  try {
    return JSON.parse(text,) as T;
  } catch {
    return fallback;
  }
}

/**
 * Execute a promise with a timeout.
 * Returns null if the timeout is exceeded.
 */
async function withTimeout<T,>(promise: Promise<T>, ms: number,): Promise<T | null> {
  const timeout = new Promise<null>((_, reject,) =>
    setTimeout(() => reject(new Error("timeout",),), ms,),
  );
  try {
    return await Promise.race([promise, timeout,],);
  } catch {
    return null;
  }
}
