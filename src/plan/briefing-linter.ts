// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure five-axis BriefingScript scorer for `.plan` ticket markdown.
 * Deterministic section detection only — no LLM, no I/O, no throws.
 * @module plan/briefing-linter
 */

/** The five SASE-derived quality axes. */
export interface BriefingAxes {
  what: boolean;
  context: boolean;
  strategy: boolean;
  gotchas: boolean;
  testability: boolean;
}

/** Verdict bands: actionable >= 4, marginal 3, reject <= 2. */
export type BriefingVerdict = "actionable" | "marginal" | "reject";

/** Score result with one concrete improvement per unmet axis. */
export interface BriefingLintResult {
  axes: BriefingAxes;
  score: number;
  verdict: BriefingVerdict;
  suggestions: string[];
}

/** Options for {@link lintBriefing}. */
export interface LintBriefingOptions {
  /** Ticket kind from the filename prefix; BUG exempts the strategy axis. */
  kind?: string;
}

const HEADING = /^#{2,3}\s+(.+?)\s*$/;
const FIELD = /^\*\*([^*]+):\*\*\s*(.*)$/;
const NEXT_SECTION = /^(?:#{1,3}\s+|\*\*[A-Za-z][^*]*:\*\*)/;
const CHECKBOX = /- \[[ xX]\]/;
const CROSS_REF = /(?:src\/[a-z0-9-/.]+|epic-[a-z0-9-]+|\.md\b)/;
const MEASURABLE = /(?:[<>≤≥]=?\s*\d+|\d+\s*(?:ms|s\b|%|results?|files?))/i;

const STRATEGY_HEADINGS = ["strategic advice", "implementation", "notes",];
const GOTCHA_HEADINGS = ["risks", "gotchas", "notes / verification",];

/** Body text of the first matching section, or empty. */
function sectionBody(lines: readonly string[], names: readonly string[],): string {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const heading = HEADING.exec(line,);
    const field = FIELD.exec(line,);
    const title = (heading?.[1] ?? field?.[1] ?? "").trim().toLowerCase();
    if (!names.includes(title,)) { continue; }

    const first = heading ? "" : field?.[2] ?? "";
    const body = first === "" ? [] : [first,];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] ?? "";
      if (NEXT_SECTION.test(next,)) { break; }
      body.push(next,);
    }

    return body.join("\n",).trim();
  }

  return "";
}

/** True for real content; `(none captured)` is the generator's empty marker. */
function hasContent(text: string,): boolean {
  return text !== "" && text !== "(none captured)";
}

/**
 * Score one ticket on the five BriefingScript axes.
 * @param text - Verbatim ticket markdown.
 * @param options - Optional ticket kind (BUG exempts strategy).
 * @returns Axes, score, verdict band, and per-axis suggestions.
 */
export function lintBriefing(text: string, options: LintBriefingOptions = {},): BriefingLintResult {
  const lines = text.split("\n",);
  const summary = sectionBody(lines, ["summary",],);
  const context = sectionBody(lines, ["context",],);
  const criteria = sectionBody(lines, ["acceptance criteria",],);
  const strategy = sectionBody(lines, STRATEGY_HEADINGS,);
  const gotchas = sectionBody(lines, GOTCHA_HEADINGS,);
  const isBug = (options.kind ?? "").toUpperCase() === "BUG";

  const checks = CHECKBOX.test(criteria,);
  const axes: BriefingAxes = {
    what: hasContent(summary,) && hasContent(criteria,) && checks,
    context: hasContent(context,) && CROSS_REF.test(context,),
    strategy: isBug || hasContent(strategy,),
    gotchas: hasContent(gotchas,),
    testability: checks,
  };

  const suggestions: string[] = [];
  if (!axes.what) {
    suggestions.push("Add a non-empty Summary and an Acceptance Criteria section with at least one '- [ ]' checkbox.",);
  }

  if (!axes.context) {
    suggestions.push("Add a Context section referencing an epic-... id, an src/... path, or a .md file.",);
  }

  if (!axes.strategy) {
    suggestions.push(
      "Add a Strategic Advice or Implementation section describing the approach (BUG tickets are exempt).",
    );
  }

  if (!axes.gotchas) {
    suggestions.push("Add a Risks, Gotchas, or Notes / Verification section.",);
  }

  if (!axes.testability || !MEASURABLE.test(criteria,)) {
    suggestions.push("Add a measurable acceptance criterion (for example '<=500ms' or '>=3 results').",);
  }

  const score = Object.values(axes,).filter(Boolean,).length;
  const verdict: BriefingVerdict = score >= 4 ? "actionable" : score === 3 ? "marginal" : "reject";
  return { axes, score, verdict, suggestions, };
}
