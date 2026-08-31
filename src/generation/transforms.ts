// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { RegexTransform, RegexTransformPhase, } from "../config/schema";
import { compileSafeRegExp, } from "../utils/safe-regexp";

/** */
export interface TransformResult {
  text: string;
  applied: { name: string; pattern: string; matches: number }[];
}

/** Canonical phase execution order. Transforms run phase-grouped, in this order. */
export const REGEX_TRANSFORM_PHASE_ORDER: RegexTransformPhase[] = [
  "edit-input",
  "output",
  "process",
  "display",
];

const DEFAULT_PHASE: RegexTransformPhase = "output";

/**
 * Apply regex transforms to LLM output text.
 * Transforms are grouped by `phase` and run phase-grouped in canonical order
 * (edit-input → output → process → display); within a phase, list order is
 * preserved. Each tracks match count.
 * @param text
 * @param transforms
 */
export function applyRegexTransforms(
  text: string,
  transforms: RegexTransform[],
): TransformResult {
  const applied: TransformResult["applied"] = [];
  let current = text;

  const byPhase = new Map<RegexTransformPhase, RegexTransform[]>();
  for (const t of transforms) {
    const phase = t.phase ?? DEFAULT_PHASE;
    const bucket = byPhase.get(phase,);
    if (bucket) { bucket.push(t,); }
    else { byPhase.set(phase, [t,],); }
  }

  for (const phase of REGEX_TRANSFORM_PHASE_ORDER) {
    const bucket = byPhase.get(phase,);
    if (!bucket) { continue; }
    for (const t of bucket) {
      if (!t.enabled) { continue; }
      try {
        // Transform patterns come from user config / shared presets — untrusted.
        // Safe compile rejects catastrophic-backtracking shapes (ReDoS).
        const regex = compileSafeRegExp(t.pattern, t.flags ?? "g",);
        if (!regex) { continue; }
        const matches = current.match(regex,);
        if (matches && matches.length > 0) {
          applied.push({ name: t.name, pattern: t.pattern, matches: matches.length, },);

          current = current.replace(regex, t.replacement,);
        }
      } catch {
        // Skip invalid or unsafe regex patterns
      }
    }
  }

  return { text: current, applied, };
}
