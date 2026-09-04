// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LLM-Assist pass — proposes growth_log entries from recent chat context.
 *
 * Per `.plan/epics/epic-character-growth.md` D6: this pass is **opt-in**
 * (per character via `actors.llm_assist_enabled`), **off by default**,
 * and produces **pending** entries that require author/GM `confirm`
 * before they apply to ground-truth tables.
 *
 * This file ships the wiring (mode gate, pass skeleton, entry factory).
 * The full aux-LLM summarizer is a follow-on implementation; the
 * production pass will call into `src/aux-pipeline/` and emit
 * `arc_stage_proposed` / `observation` entries.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { insertGrowthLog, } from "./crud";
import type {
  GrowthAxis,
  GrowthEventType,
} from "../../spec/growth";

/** Options for the LLM-assist pass. */
export interface RunLlmAssistOpts {
  actorId: string;
  /** Recent chat context the LLM summarizer should reason over. */
  chatContext: string;
  /** Optional explicit axis / event focus from the caller. */
  hint?: { axis: GrowthAxis; eventType: GrowthEventType; };
}

/**
 * Run the LLM-assist pass for an actor. Returns the inserted pending
 * entry id, or `null` when the pass is disabled (`llm_assist_enabled`
 * is false) or refused (static mode).
 *
 * The aux-LLM call itself is intentionally stubbed — the production
 * pass will resolve `aux-pipeline`. This file owns the gate and the
 * pending-entry write only.
 * @param db
 * @param opts
 */
export async function runLlmAssist(
  db: Kysely<DB>, opts: RunLlmAssistOpts,
): Promise<{ entryId: string | null; }> {
  // 1. Read the actor's growth mode + llm_assist_enabled flag.
  const actorRow = await db
    .selectFrom("actors",)
    .where("id", "=", opts.actorId,)
    .select(["growth_mode", "llm_assist_enabled",],)
    .executeTakeFirst();
  if (!actorRow) { return { entryId: null, }; }

  if (!actorRow.llm_assist_enabled) {
    return { entryId: null, };
  }
  if (actorRow.growth_mode === "static") {
    return { entryId: null, };
  }

  // 2. Stubbed summarizer — production wires the aux-LLM call here.
  //    For now we emit an `observation` entry so the wiring is
  //    exercisable end-to-end via the API.
  const entry = await insertGrowthLog(db, {
    actorId: opts.actorId,
    axis: opts.hint?.axis ?? "arc",
    eventType: opts.hint?.eventType ?? "observation",
    status: "pending",
    reason: "LLM-assist stub: replace with aux-pipeline summarizer output.",
  },);
  return { entryId: entry.id, };
}
