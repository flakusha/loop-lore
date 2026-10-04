// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Classifier-backed Turn Selection (FEAT-classifier-backed-actor-and-beat-selection).
 *
 * A small-classifier decision path that proposes which addressed actor should
 * take the next beat and what kind of beat it is. The verdict rides on
 * `GroupTurnContext.classifierPick` so the pure `quest_driven` and `hybrid`
 * strategies can consult it without becoming async.
 *
 * Fail-open contract: unconfigured aux/classifier model, timeout, parse
 * failure, or an unknown label yields `null` and callers fall back to the
 * existing deterministic selection. This module NEVER throws.
 *
 * Routing goes through the EXISTING `intent` aux task (no new AuxTaskName):
 * `callAux` resolves the `Classifier` model role for it when one is
 * configured, falling back to the auxiliary role.
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../aux-pipeline/index";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { jsonParseOr, } from "../utils";

/**
 * Lazy module logger — `getLogger()` throws before `createLogger()`, and this
 * module is imported by test files that never initialize the root logger.
 * @returns Child logger bound to the turn-classifier module
 */
function log(): Logger {
  return getLogger().child({ module: "turn-classifier", },);
}

/** Beat kinds a classifier may assign to the addressed actor's next turn. */
export const TURN_BEAT_TYPES = ["dialogue", "action", "narration",] as const;
export type TurnBeatType = (typeof TURN_BEAT_TYPES)[number];

/** Classifier-proposed turn decision, already validated against the label set. */
export interface TurnClassifierPick {
  /** Actor that should take the next beat (validated participant id). */
  actorId: string;
  /** Kind of beat the actor should take. */
  beatType: TurnBeatType;
}

/** One selectable participant label shown to the classifier. */
export interface ClassifierCandidate {
  actorId: string;
  displayName: string;
}

/** System prompt for the selection-shaped `intent` task call. */
export const TURN_SELECTION_PROMPT = [
  "You are a turn director for a roleplay chat. Pick which participant should",
  "take the next beat and what kind of beat it is.",
  'Respond with ONLY JSON: {"actorId":"<id>","beatType":"dialogue|action|narration"}.',
  "Rules: actorId MUST be copied exactly from the candidate list; beatType is",
  'one of "dialogue" (they speak), "action" (they act/move), "narration" (they',
  "describe the scene). No prose, no markdown fences.",
].join(" ",);

/**
 * Extract the first JSON object from a raw model response, tolerating
 * markdown fences and stray prose around the verdict.
 * @param content - Raw LLM response text
 * @returns The JSON substring, or null when no object is present
 */
function extractJsonObject(content: string,): string | null {
  const start = content.indexOf("{",);
  const end = content.lastIndexOf("}",);
  if (start < 0 || end <= start) { return null; }
  return content.slice(start, end + 1,);
}

/**
 * Parse and strictly validate a raw classifier verdict.
 *
 * Pure and side-effect free — unit-testable without a live provider. The
 * actorId MUST exactly match a candidate id and the beatType MUST be a
 * known {@link TurnBeatType}; anything else is discarded (fail-open).
 * @param content - Raw LLM response text
 * @param candidates - Participant labels the classifier chose from
 * @returns The validated pick, or null when any label is unknown
 *
 * @example
 * parseTurnSelection('{"actorId":"a2","beatType":"action"}', [{ actorId: "a2", displayName: "Bo" }])
 * // { actorId: "a2", beatType: "action" }
 */
export function parseTurnSelection(
  content: string,
  candidates: readonly ClassifierCandidate[],
): TurnClassifierPick | null {
  const json = extractJsonObject(content,);
  if (!json) { return null; }
  const parsed = jsonParseOr<Partial<TurnClassifierPick>>(json, {},);
  if (typeof parsed.actorId !== "string" || typeof parsed.beatType !== "string") { return null; }
  const actorId = parsed.actorId.trim();
  if (!candidates.some((c,) => c.actorId === actorId)) { return null; }
  if (!TURN_BEAT_TYPES.includes(parsed.beatType as TurnBeatType,)) { return null; }
  return { actorId, beatType: parsed.beatType, };
}

/** Options for {@link resolveTurnClassifierPick}. */
export interface TurnClassifierOptions {
  /** Application config (aux/classifier model resolution). */
  config: Config;
  /** Active Kysely database. */
  db: Kysely<DB>;
  /** Chat id for telemetry context. */
  chatId: string;
  /** User id for BYO apiKey resolution. */
  userId?: string;
  /** Latest message driving this turn (cascades pass none). */
  userMessage?: string;
  /** Eligible participants — muted/cooldown-filtered by the caller. */
  participants: ClassifierCandidate[];
}

/**
 * Ask the classifier which participant should take the next beat.
 *
 * Builds a compact label list from the participants and routes a
 * selection-shaped prompt through the shared `intent` aux task. Returns
 * null when no aux/classifier model is configured, the call fails, or the
 * verdict carries an unknown label — never throws.
 * @param opts - {@link TurnClassifierOptions}
 * @returns {Promise<TurnClassifierPick | null>} Validated pick, or null on any failure
 */
export async function resolveTurnClassifierPick(
  opts: TurnClassifierOptions,
): Promise<TurnClassifierPick | null> {
  if (opts.participants.length === 0) { return null; }
  try {
    const labels = opts.participants
      .map((c,) => `- ${c.actorId}: ${c.displayName}`)
      .join("\n",);
    const transcript = opts.userMessage?.slice(0, 500,) ?? "";
    const result = await callAux("intent", opts.config, opts.db, [
      { role: "system" as const, content: TURN_SELECTION_PROMPT, },
      { role: "user" as const, content: `Candidates:\n${labels}\n\nLatest message:\n${transcript}`, },
    ], {
      userId: opts.userId,
      chatId: opts.chatId,
      temperature: 0,
      maxTokens: 100,
    },);
    if (!result) { return null; }
    const pick = parseTurnSelection(result.content, opts.participants,);
    if (!pick) {
      log().debug("Classifier verdict discarded (unknown label)", { chatId: opts.chatId, },);
    }
    return pick;
  } catch (error) {
    log().warn("Classifier turn selection failed; using deterministic path", { error: String(error,), },);
    return null;
  }
}
