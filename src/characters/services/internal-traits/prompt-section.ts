// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt-section builders for character internal traits.
 *
 * Renders the visible trait groups (aspirations, moral disposition, approach
 * tendencies, voice patterns) into the prompt assembly. Extracted from the
 * service to keep cognitive complexity and file size within the gate.
 */

import type { Aspiration, } from "./types";

// ── Prompt section builders ────────────────────────────────────

/**
 * @param lines
 * @param aspirations
 * @param isVisible
 */
function appendAspirations(lines: string[], aspirations: Aspiration[], isVisible: (f: string,) => boolean,): void {
  if (aspirations.length === 0) { return; }
  const visible: Aspiration[] = [];
  for (const a of aspirations) {
    if (isVisible("aspirations",) || a.visibility === "open") { visible.push(a,); }
  }
  if (visible.length === 0) { return; }
  lines.push("### Goals & Aspirations",);
  for (const a of visible) {
    const progress = a.progress > 0 ? ` (${a.progress}% progress)` : "";
    lines.push(`- [${a.priority}] ${a.goal}${progress}`,);
    if (a.plans.length > 0) { lines.push(`  Plans: ${a.plans.join("; ",)}`,); }
  }
  lines.push("",);
}

/**
 * @param lines
 * @param m
 * @param m.lawful_chaotic
 * @param m.good_evil
 * @param isVisible
 */
function appendMoralDisposition(
  lines: string[],
  m: { lawful_chaotic: number; good_evil: number },
  isVisible: (f: string,) => boolean,
): void {
  if (!isVisible("moralDisposition",)) { return; }
  const lawAxis = m.lawful_chaotic < -30 ? "lawful" : (m.lawful_chaotic > 30 ? "chaotic" : "neutral");
  const goodAxis = m.good_evil < -30 ? "good" : (m.good_evil > 30 ? "evil" : "amoral");
  lines.push(`### Moral Disposition: ${lawAxis}-${goodAxis}`, "",);
}

/**
 * @param lines
 * @param a
 * @param a.decision_style
 * @param a.risk_tolerance
 * @param a.initiative_level
 * @param isVisible
 */
function appendApproachTendencies(
  lines: string[],
  a: { decision_style: string; risk_tolerance: number; initiative_level: number },
  isVisible: (f: string,) => boolean,
): void {
  if (!isVisible("approachTendencies",)) { return; }
  lines.push(
    `### Approach: ${a.decision_style} decision-maker, risk tolerance ${a.risk_tolerance}/100, initiative ${a.initiative_level}/100`,
    "",
  );
}

/**
 * @param lines
 * @param v
 * @param v.vocabulary_level
 * @param v.sentence_structure
 * @param v.humor_style
 * @param v.verbal_tics
 * @param v.emotional_range
 * @param isVisible
 */
function appendVoicePatterns(
  lines: string[],
  v: {
    vocabulary_level: string;
    sentence_structure: string;
    humor_style: string;
    verbal_tics: string[];
    emotional_range: number;
  },
  isVisible: (f: string,) => boolean,
): void {
  if (!isVisible("voicePatterns",)) { return; }
  lines.push("### Voice & Speech", `- Vocabulary: ${v.vocabulary_level}`, `- Sentences: ${v.sentence_structure}`,);
  if (v.humor_style !== "none") { lines.push(`- Humor: ${v.humor_style}`,); }
  if (v.verbal_tics.length > 0) { lines.push(`- Tics: ${v.verbal_tics.join(", ",)}`,); }
  lines.push(`- Emotional range: ${v.emotional_range}/100`, "",);
}

export { appendApproachTendencies, appendAspirations, appendMoralDisposition, appendVoicePatterns, };
