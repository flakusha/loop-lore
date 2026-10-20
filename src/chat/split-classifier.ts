// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

export async function classifySplitIntent(
  content: string,
  _recentMessages: string[],
  config: Config,
  db: Kysely<DB>,
  userId?: string,
): Promise<SplitClassification> {
  if (detectSplitIntent(content,)) {
    return { isSplit: true, isReunite: false, source: "regex", };
  }

  if (detectReuniteIntent(content,)) {
    return { isSplit: false, isReunite: true, source: "regex", };
  }

  try {
    const response = await callAux("transition", config, db, [{ role: "user", content, },], {
      userId,
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
  } catch {
    getLogger().child({ module: "split-classifier", },).debug("AUX classification failed",);
  }

  return { isSplit: false, isReunite: false, source: "none", };
}
