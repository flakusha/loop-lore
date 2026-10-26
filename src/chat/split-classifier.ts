// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Party split / reunion intent classifier.
 *
 * Regex first (instant, zero cost). The AUX-LLM fallback is OPT-IN because the
 * only wired caller (routes/messages/handle-scene-transitions.ts) runs on every
 * user message just to detect-and-log split narration, and it already awaits
 * the transition classifier's own AUX roundtrip on that same message. A second
 * blocking AUX call (2s hard cap, aux-pipeline/runner.ts) there would spend the
 * message path's budget on an observability line; AUX split classification
 * belongs to the transition AUX slice
 * (.plan/tickets/TASK-transition-aux-llm-fallback.md), which owns that cost.
 * Callers that genuinely need the fallback pass `allowAux: true`.
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../aux-pipeline";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonParseOr, } from "../utils";
import { detectReuniteIntent, detectSplitIntent, } from "./service/split";

export interface SplitClassification {
  isSplit: boolean;
  isReunite: boolean;
  source: "regex" | "aux-llm" | "none";
}

export interface ClassifySplitOptions {
  /**
   * Opt in to the AUX-LLM fallback on a regex miss. Default `false`: the
   * per-message caller only needs the regex verdict (see module docs).
   */
  allowAux?: boolean;
  /** User id for BYO apiKey resolution when the fallback runs. */
  userId?: string;
}

/**
 * Classify a message as party split / reunion narration.
 * @param content - User message content
 * @param config - Application config
 * @param db - Kysely instance
 * @param opts - Fallback opt-in and BYO identity (see {@link ClassifySplitOptions})
 * @returns Classification with the source that produced it
 */
export async function classifySplitIntent(
  content: string,
  config: Config,
  db: Kysely<DB>,
  opts: ClassifySplitOptions = {},
): Promise<SplitClassification> {
  if (detectSplitIntent(content,)) {
    return { isSplit: true, isReunite: false, source: "regex", };
  }

  if (detectReuniteIntent(content,)) {
    return { isSplit: false, isReunite: true, source: "regex", };
  }

  if (opts.allowAux !== true) {
    return { isSplit: false, isReunite: false, source: "none", };
  }

  try {
    const response = await callAux("transition", config, db, [{ role: "user", content, },], {
      userId: opts.userId,
      temperature: 0,
      maxTokens: 60,
    },);

    if (response) {
      const parsed = jsonParseOr<{ isSplit?: boolean; isReunite?: boolean }>(response.content, {},);
      if (typeof parsed.isSplit === "boolean" || typeof parsed.isReunite === "boolean") {
        return {
          isSplit: parsed.isSplit === true,
          isReunite: parsed.isReunite === true,
          source: "aux-llm",
        };
      }
    }
  } catch (error) {
    // callAux degrades to null on its own failures; this only guards a thrown
    // call so one message can never fail the POST path over an advisory signal.
    getLogger()
      .child({ module: "split-classifier", },)
      .warn("AUX split classification failed — falling back to no intent", {
        error: error instanceof Error ? error.message : String(error,),
      },);
  }

  return { isSplit: false, isReunite: false, source: "none", };
}
