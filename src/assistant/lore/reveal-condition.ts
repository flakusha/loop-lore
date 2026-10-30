// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore reveal conditions — the secret-lore gate from epic-lore-knowledge.
 *
 * A lore row with a non-blank `reveal_condition` (JSON text column, 084
 * migration) is a *secret*: the lore injection path withholds it until the
 * condition is met. Conditions are author-controlled JSON trees:
 *
 *     { "all": [ <condition>, ... ] }        // every sub-condition must hold
 *     { "any": [ <condition>, ... ] }        // at least one must hold
 *     { "keywords": ["word", ...] }          // character actions/speech: any
 *                                            // keyword in the scanned window
 *     { "event": "meteor_fall" }             // timeline events: an event_type
 *                                            // or description keyword that has
 *                                            // occurred on the chat's timeline
 *
 * Leaves combine freely inside `all` / `any` (bounded nesting).
 *
 * Failure conventions (match `lore-activation.ts`): malformed JSON, wrong
 * shapes, over-deep nesting, and unknown rarity-ish junk all fail **closed** —
 * a secret that cannot be evaluated is withheld, never silently revealed.
 * An entry whose `reveal_condition` column is null/blank is not secret.
 *
 * Resolves: epic-lore-knowledge — reveal_condition field + evaluation.
 */
import { safeJsonParse, } from "@/utils";

/** Deepest `all`/`any` nesting accepted; deeper trees fail closed. */
export const MAX_REVEAL_DEPTH = 8;

/** A parsed reveal-condition tree (validated; unknown keys ignored). */
export interface RevealCondition {
  /** Every sub-condition must hold. */
  all?: RevealCondition[];
  /** At least one sub-condition must hold. */
  any?: RevealCondition[];
  /** Met when any keyword appears in the scanned conversation window. */
  keywords?: string[];
  /** Met when a timeline event of this type — or containing this keyword in
   *  its description — exists on the chat's timeline. */
  event?: string;
}

/** Ground truth a condition is evaluated against (built by `lore-load`). */
export interface RevealContext {
  /** Lowercased word set of the entry's scanned conversation window. */
  words: ReadonlySet<string>;
  /** Lowercased `event_type` values observed on the chat's timeline. */
  timelineEventTypes: ReadonlySet<string>;
  /** Lowercased concatenation of those events' descriptions. */
  timelineEventText: string;
}

/** Whether a raw `reveal_condition` column value marks the row as secret. */
export function hasRevealCondition(raw: string | null | undefined,): boolean {
  return raw != null && raw.trim() !== "";
}

/**
 * Parse and validate a raw `reveal_condition` value.
 * @param raw Raw column value (JSON text).
 * @returns The condition tree, or null when absent/blank/malformed (callers
 *   treat "null while {@link hasRevealCondition} is true" as fail-closed).
 */
export function parseRevealCondition(raw: string | null | undefined,): RevealCondition | null {
  if (!hasRevealCondition(raw,)) { return null; }
  const parsed = safeJsonParse<unknown>(raw!,);
  if (!parsed.ok) { return null; }
  return validateCondition(parsed.value, 0,);
}

/**
 * Structural validation — plain object with at most the known keys, arrays
 * of strings for `keywords`, strings for `event`, recursion for `all`/`any`
 * up to {@link MAX_REVEAL_DEPTH}. Anything else is invalid.
 */
function validateCondition(value: unknown, depth: number,): RevealCondition | null {
  if (
    depth > MAX_REVEAL_DEPTH || value === null || typeof value !== "object" ||
    Array.isArray(value,)
  ) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const condition: RevealCondition = {};
  if (raw["all"] !== undefined) {
    const children = validateChildren(raw["all"], depth,);
    if (children === null) { return null; }
    condition.all = children;
  }

  if (raw["any"] !== undefined) {
    const children = validateChildren(raw["any"], depth,);
    if (children === null) { return null; }
    condition.any = children;
  }

  if (raw["keywords"] !== undefined) {
    if (!isStringArray(raw["keywords"],)) { return null; }
    condition.keywords = raw["keywords"];
  }

  if (raw["event"] !== undefined) {
    if (typeof raw["event"] !== "string") { return null; }
    condition.event = raw["event"];
  }

  return condition;
}

/** Validate an `all`/`any` child list; null when any child is invalid. */
function validateChildren(
  list: unknown,
  depth: number,
): RevealCondition[] | null {
  if (!Array.isArray(list,)) { return null; }
  const children: RevealCondition[] = [];
  for (const child of list) {
    const validated = validateCondition(child, depth + 1,);
    if (validated === null) { return null; }
    children.push(validated,);
  }

  return children;
}

/** Type guard: every element a string. */
function isStringArray(value: unknown,): value is string[] {
  return Array.isArray(value,) && value.every((v,) => typeof v === "string");
}

/** Whether the condition tree contains at least one `event` leaf. */
export function revealConditionNeedsEvents(condition: RevealCondition,): boolean {
  if (condition.event !== undefined) { return true; }
  return (condition.all ?? []).some(revealConditionNeedsEvents,) ||
    (condition.any ?? []).some(revealConditionNeedsEvents,);
}

/**
 * Evaluate a parsed condition against conversation + timeline ground truth.
 * An empty condition object (no leaves at all) is vacuously met — the author
 * gated the entry without constraining it.
 * @param condition Parsed condition tree (never null).
 * @param ctx Conversation words + timeline event observations.
 * @returns True when every part of the condition holds.
 */
export function revealConditionMet(condition: RevealCondition, ctx: RevealContext,): boolean {
  for (const sub of condition.all ?? []) {
    if (!revealConditionMet(sub, ctx,)) { return false; }
  }

  if (condition.any !== undefined && !condition.any.some((sub,) => revealConditionMet(sub, ctx,))) {
    return false;
  }

  if (condition.keywords !== undefined && condition.keywords.length > 0) {
    if (!condition.keywords.some((k,) => ctx.words.has(k.toLowerCase(),))) { return false; }
  }

  if (condition.event !== undefined && condition.event.trim() !== "") {
    const needle = condition.event.toLowerCase();
    if (!ctx.timelineEventTypes.has(needle,) && !ctx.timelineEventText.includes(needle,)) {
      return false;
    }
  }

  return true;
}
