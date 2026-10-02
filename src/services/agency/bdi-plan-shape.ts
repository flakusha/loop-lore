// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plan shape for the BDI nightly cycle: the prompt, the parser, and the
 * deterministic fallback. Pure — no DB, no LLM, no logger — so the
 * degradation path is exercisable without a provider.
 *
 * An LLM returns text, so parsing IS the contract here. Anything that
 * does not shape up yields `null`, and the caller falls back to a plan
 * derived from the NPC's own state rather than throwing.
 *
 * @module services/agency/bdi-plan-shape
 */

import type { GenerationMessage, } from "../../generation/gen-types-options";
import { CODE_FENCE_JSON, } from "../../regex/code-fence";
import { clamp, jsonParseOr, } from "../../utils";

/** Priority vocabulary for a daily plan.
 *
 *  Deliberately an enum-like union, not a free-form string: the nightly
 *  cycle compares it against `prevPlan.priority` to decide whether to emit
 *  a `PlanRevision` (`bdi-nightly.ts:96`). An open vocabulary emits a
 *  revision almost every night, because a model asked twice rarely
 *  returns byte-identical prose. Four buckets keep the comparison
 *  meaningful; an unrecognised model value is treated as malformed
 *  rather than widening the column's semantics.
 */
export const PLAN_PRIORITIES = {
  Low: "low",
  Normal: "normal",
  High: "high",
  Critical: "critical",
} as const;

export type PlanPriority = (typeof PLAN_PRIORITIES)[keyof typeof PLAN_PRIORITIES];

/** An LLM is not bound by `maxActors`; cap the rows one plan can insert. */
export const MAX_ACTIVITIES = 5;

/** Summary and description are free text — bound them so one turn cannot
 *  write a novel into `actor_daily_plans.summary`. */
const MAX_TEXT_CHARS = 500;

/** A parsed daily plan, in the shape `actor_daily_plans` stores. */
export interface DailyPlan {
  summary: string;
  priority: PlanPriority;
  activities: Array<{ description: string; score: number }>;
}

/** The state a plan is derived from — what the DB knows, never what a
 *  model previously claimed about the actor. */
export interface PlanFacts {
  actorName: string;
  worldName: string | null;
  locationId: string | null;
  locationName: string | null;
  health: number | null;
  mentalState: string | null;
  movementPattern: string | null;
  prevSummary: string | null;
  prevPriority: string | null;
}

const SYSTEM_PROMPT = [
  "You plan one in-world day for a single character.",
  `Reply with ONE JSON object and nothing else: {"summary": string, "priority": one of "${
    Object.values(PLAN_PRIORITIES,).join(`", "`,)
  }", "activities": [{"description": string, "score": number 0-100}]}`,
  `At most ${MAX_ACTIVITIES} activities, most important first.`,
].join(" ",);

/**
 * Build the plan prompt from state, for `today` (the plans are dated).
 * @param facts
 * @param today ISO YYYY-MM-DD plan date
 * @returns a two-message prompt (system + user)
 */
export function buildPlanPrompt(facts: PlanFacts, today: string,): GenerationMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT, },
    {
      role: "user",
      content: [
        `Date: ${today}`,
        `Actor: ${facts.actorName}`,
        `World: ${facts.worldName ?? "unknown"}`,
        `Location: ${facts.locationName ?? facts.locationId ?? "unrecorded"}`,
        `Health: ${facts.health ?? "unrecorded"}`,
        `Mental state: ${facts.mentalState ?? "unrecorded"}`,
        `Movement pattern: ${facts.movementPattern ?? "unrecorded"}`,
        `Yesterday's plan (${facts.prevPriority ?? "none"}): ${facts.prevSummary ?? "none"}`,
      ].join("\n",),
    },
  ];
}

/**
 * Parse model text into a plan.
 * @param raw the LLM's raw content, fenced or bare
 * @param maxActivities cap on retained activities
 * @returns the plan, or `null` when the text is not one
 */
export function parsePlan(raw: string, maxActivities: number,): DailyPlan | null {
  const fenced = CODE_FENCE_JSON.exec(raw,)?.[1] ?? raw;
  const start = fenced.indexOf("{",);
  const end = fenced.lastIndexOf("}",);
  if (start < 0 || end <= start) { return null; }
  const value = jsonParseOr<unknown>(fenced.slice(start, end + 1,), null,);
  if (typeof value !== "object" || value === null) { return null; }
  const record = value as Record<string, unknown>;

  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  if (!summary) { return null; }

  const rawPriority = typeof record.priority === "string" ? record.priority.toLowerCase().trim() : "";
  const priority = Object.values(PLAN_PRIORITIES,).find((p,) => p === rawPriority);
  if (priority === undefined) { return null; }

  const activities = normalizeActivities(record.activities, maxActivities,);
  if (activities.length === 0) { return null; }

  return { summary: summary.slice(0, MAX_TEXT_CHARS,), priority, activities, };
}

function normalizeActivities(
  value: unknown,
  maxActivities: number,
): Array<{ description: string; score: number }> {
  if (!Array.isArray(value,)) { return []; }
  const out: Array<{ description: string; score: number }> = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) { continue; }
    const record = item as Record<string, unknown>;
    const description = typeof record.description === "string" ? record.description.trim() : "";
    if (!description) { continue; }
    const score = typeof record.score === "number" && Number.isFinite(record.score,) ? record.score : 50;
    out.push({
      description: description.slice(0, MAX_TEXT_CHARS,),
      score: Math.round(clamp(score, 0, 100,),),
    },);
    if (out.length >= maxActivities) { break; }
  }
  return out;
}

/**
 * Deterministic plan from the NPC's own state. Used when the model is
 * unreachable or its output is unusable — the cycle still records a plan
 * row for the night instead of stalling the remaining actors.
 * @param facts null when even the state read failed
 * @returns a state-derived plan
 */
export function fallbackPlan(facts: PlanFacts | null,): DailyPlan {
  const where = facts?.locationName ?? facts?.locationId ?? "the usual haunts";
  const pattern = facts?.movementPattern ?? null;
  const urgent = facts !== null &&
    ((facts.health !== null && facts.health <= 30) || facts.mentalState === "hostile" ||
      facts.mentalState === "afraid");
  return {
    summary: facts === null
      ? "Hold position; not enough state to plan a richer day."
      : `Routine day around ${where}${
        pattern !== null && pattern !== "stationary" ? `, keeping to the ${pattern} pattern` : ""
      }.`,
    priority: urgent ? PLAN_PRIORITIES.High : PLAN_PRIORITIES.Normal,
    activities: [
      { description: `Keep to ${where} and mind local business.`, score: urgent ? 80 : 50, },
      pattern === null || pattern === "stationary"
        ? { description: `Rest and observe the mood at ${where}.`, score: 40, }
        : { description: `Continue the ${pattern} round out of ${where}.`, score: 60, },
    ],
  };
}
