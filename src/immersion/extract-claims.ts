// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — Deterministic Claim Extraction (WI-1)
 *
 * Turns the actor message into structured claims (movement / skill / item /
 * action) using the {@link ./claim-patterns} registries. Pure and synchronous:
 * aux-pipeline enrichment is opt-in and joins later (WI-4), never in here —
 * the default path must stay deterministic and fast.
 *
 * Priority order skill → movement → item → action with span-overlap
 * suppression, so "use my lockpicking skill" yields one skill claim instead
 * of a duplicate item claim from the shared "use" verb.
 *
 * @module immersion/extract-claims
 */
import { assertInputSize, safeRegexExec, } from "../regex/safe-exec";
import {
  ACTION_CLAIM_PATTERNS,
  ITEM_CLAIM_PATTERNS,
  MOVEMENT_CLAIM_PATTERNS,
  SKILL_CLAIM_PATTERNS,
} from "./claim-patterns";
import { type ExtractedClaim, MAX_CLAIMS_PER_MESSAGE, } from "./types";

/** Half-open span of a match within the message. */
interface Span {
  readonly start: number;
  readonly end: number;
}

function spansOverlap(a: Span, b: Span,): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Collect all matches of `pattern` over `text` (lastIndex reset per call so
 * the shared module-level RegExp objects stay safe to reuse). Bounded by
 * `remaining` — extraction stops once the per-message claim cap is reached.
 * @param {RegExp} pattern
 * @param {string} text
 * @param {number} remaining
 * @returns {RegExpExecArray[]} matches, in document order
 */
function collectMatches(pattern: RegExp, text: string, remaining: number,): RegExpExecArray[] {
  const found: RegExpExecArray[] = [];
  pattern.lastIndex = 0;
  let match = safeRegexExec(pattern, text,);
  while (match !== null && found.length < remaining) {
    found.push(match,);
    if (match[0].length === 0) {
      break; // zero-width guard — cannot advance
    }

    pattern.lastIndex = match.index + match[0].length;
    match = pattern.exec(text,);
  }

  return found;
}

/**
 * Extract deterministic claims from the actor message.
 *
 * Claims are returned in extraction order (skill, movement, item, action);
 * any later match overlapping an accepted claim's span is suppressed to keep
 * one message span = one claim. Extraction is capped at
 * {@link MAX_CLAIMS_PER_MESSAGE} claims.
 * @param {object} args
 * @param {string} args.content — actor message text
 * @param {number} [args.maxClaims] — override the per-message claim cap
 * @returns {ExtractedClaim[]} structured claims (empty when nothing claimed)
 * @throws {RegexInputTooLargeError} when `content` exceeds the pipeline cap
 */
export function extractClaims(args: { content: string; maxClaims?: number },): ExtractedClaim[] {
  const { content, } = args;
  assertInputSize(content,);
  const maxClaims = args.maxClaims ?? MAX_CLAIMS_PER_MESSAGE;
  const claims: ExtractedClaim[] = [];
  const accepted: Span[] = [];

  const accept = (claim: ExtractedClaim, span: Span,): boolean => {
    if (claims.length >= maxClaims || accepted.some((s,) => spansOverlap(s, span,))) {
      return false;
    }

    claims.push(claim,);
    accepted.push(span,);
    return true;
  };

  for (const pattern of SKILL_CLAIM_PATTERNS) {
    for (const match of collectMatches(pattern, content, maxClaims - claims.length,)) {
      const skill = match[1]?.trim().toLowerCase();
      if (!skill) {
        continue;
      }

      accept(
        { kind: "skill", skill, text: match[0], matchIndex: match.index, },
        { start: match.index, end: match.index + match[0].length, },
      );
    }
  }

  for (const pattern of MOVEMENT_CLAIM_PATTERNS) {
    for (const match of collectMatches(pattern, content, maxClaims - claims.length,)) {
      const verb = match[1]?.trim().toLowerCase();
      if (!verb) {
        continue;
      }

      accept(
        { kind: "movement", verb, text: match[0], matchIndex: match.index, },
        { start: match.index, end: match.index + match[0].length, },
      );
    }
  }

  for (const [pattern, action,] of ITEM_CLAIM_PATTERNS) {
    for (const match of collectMatches(pattern, content, maxClaims - claims.length,)) {
      const item = match[1]?.trim().toLowerCase();
      if (!item) {
        continue;
      }

      accept(
        { kind: "item", item, action, text: match[0], matchIndex: match.index, },
        { start: match.index, end: match.index + match[0].length, },
      );
    }
  }

  for (const pattern of ACTION_CLAIM_PATTERNS) {
    for (const match of collectMatches(pattern, content, maxClaims - claims.length,)) {
      const verb = match[1]?.trim().toLowerCase();
      if (!verb) {
        continue;
      }

      accept(
        { kind: "action", verb, text: match[0], matchIndex: match.index, },
        { start: match.index, end: match.index + match[0].length, },
      );
    }
  }

  return claims;
}
