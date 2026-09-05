// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Traits ↔ Growth bridge.
 *
 * Single dependency direction: the growth service owns this bridge.
 * The traits service does NOT call into growth; instead, callers
 * (story events, GM commands) call `recordTraitDrift` after they have
 * decided a drift should occur.
 *
 * D3 enforcement: `recordTraitDrift` re-checks
 * `checkPersonalityIntegrity` before recording a growth row. Drift is
 * allowed only on `social` / `world` categories; `identity`,
 * `personality`, `background` are refused with `integrity_forbidden`.
 */
import { jsonStringifyOr, } from "@/utils";
import type { Kysely, } from "kysely";
import type { TraitCategory, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, } from "../../utils/safe-json";
import { getGrowthMode, insertGrowthLog, } from "./growth-service/crud";
import { GrowthServiceError, } from "./growth-service/types";
import { checkPersonalityIntegrity, } from "./personality-service/integrity";

/** Options for `recordTraitDrift`. */
export interface RecordTraitDriftOpts {
  actorId: string;
  traitName: string;
  traitCategory: TraitCategory;
  beforeValue: string;
  afterValue: string;
  reason: string;
  sourceEventId?: string;
}

/**
 * Validate that a trait drift is allowed under personality integrity,
 * then record a growth_log entry. The actual trait row update is the
 * caller's responsibility (via `traits-service`); this bridge only
 * owns the growth bookkeeping.
 * @param db
 * @param opts
 */
export async function recordTraitDrift(
  db: Kysely<DB>,
  opts: RecordTraitDriftOpts,
): Promise<{ growthEntryId: string }> {
  const result = checkPersonalityIntegrity(opts.traitName, opts.traitCategory,);
  if (!result.allowed) {
    throw new GrowthServiceError(
      `Trait drift refused for '${opts.traitName}' (${opts.traitCategory}): ${result.reason}`,
      "integrity_forbidden",
    );
  }

  const mode = await getGrowthMode(db, opts.actorId,);
  if (mode.growthMode === "static") {
    throw new GrowthServiceError(
      `Trait drift refused: character '${opts.actorId}' is static`,
      "static_mode_forbidden",
    );
  }

  const entry = await insertGrowthLog(db, {
    actorId: opts.actorId,
    axis: "trait",
    eventType: "trait_drifted",
    subjectKind: `character_${opts.traitCategory}_trait`,
    subjectId: opts.traitName,
    beforeJson: jsonStringifyOr({ value: opts.beforeValue, },),
    afterJson: jsonStringifyOr({ value: opts.afterValue, },),
    reason: opts.reason,
    sourceEventId: opts.sourceEventId ?? null,
  },);

  return { growthEntryId: entry.id, };
}
