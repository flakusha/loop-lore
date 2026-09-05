// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skills ↔ Growth bridge.
 *
 * Single dependency direction: the growth service owns this bridge.
 * Source skills service is unaware of growth — its writers do not call
 * into growth. Instead, callers who want growth bookkeeping wrap their
 * skill acquisition with `recordSkillAcquisition(...)`.
 *
 * Per `.plan/epics/epic-character-growth.md` D10: only story-driven
 * acquisitions (acquisition_source='story') generate growth_log rows.
 * Baseline skills (CharacterTemplate seeds) and config grants do not.
 *
 * Per D4: when the character is in `growth_mode='static'`, this
 * function refuses to insert a growth row. The skill acquisition
 * itself is the source service's responsibility; growth only owns
 * its own log.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createSkill, } from "../../rpg/skills/service/crud";
import type { Skill, } from "../../rpg/skills/service/types";
import { safeJsonStringify, } from "../../utils";
import { getGrowthMode, insertGrowthLog, } from "./growth-service/crud";

/** Options for `recordSkillAcquisition`. */
export interface RecordSkillAcquisitionOpts {
  /** Base fields passed to skills service `createSkill`. */
  input: Parameters<typeof createSkill>[1];
  /** Reason written to growth_log (e.g. "Story beat: character studies the tome"). */
  reason: string;
  /** Optional source event id (e.g. chat_message.id). */
  sourceEventId?: string;
}

/**
 * Create a skill and (when `acquisitionSource === 'story'`) record a
 * growth_log entry. Returns the created skill and the optional
 * growth entry id.
 *
 * @param db
 * @param opts
 */
export async function recordSkillAcquisition(
  db: Kysely<DB>,
  opts: RecordSkillAcquisitionOpts,
): Promise<{ skill: Skill; growthEntryId: string | null }> {
  const mode = await getGrowthMode(db, opts.input.actorId,);
  // Force story-source on this path: bridges are always story-driven.
  const skill = await createSkill(db, {
    ...opts.input,
    acquisitionSource: "story",
    acquiredAt: new Date().toISOString(),
    acquisitionReason: opts.reason,
  },);

  if (mode.growthMode === "static") {
    // D4: refuse to record growth on a static character. The skill
    // itself was already created above — the caller decides whether to
    // also block acquisition at the source service level.
    return { skill, growthEntryId: null, };
  }

  const snapshotResult = safeJsonStringify({
    name: skill.name,
    category: skill.category,
    level: skill.level,
    proficiency: skill.proficiency,
  },);
  const entry = await insertGrowthLog(db, {
    actorId: opts.input.actorId,
    axis: "skill",
    eventType: "skill_acquired",
    subjectKind: "character_skill",
    subjectId: skill.id,
    afterJson: snapshotResult.ok ? snapshotResult.value : "{}",
    reason: opts.reason,
    sourceEventId: opts.sourceEventId ?? null,
  },);
  return { skill, growthEntryId: entry.id, };
}
