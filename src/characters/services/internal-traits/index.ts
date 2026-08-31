// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Internal Traits Service
 *
 * Manages aspirations, moral disposition, autonomy preferences, coping
 * mechanisms, approach tendencies, and voice patterns.
 *
 * See .plan/epics/epic-character-internal-traits.md
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";
import {
  appendApproachTendencies,
  appendAspirations,
  appendMoralDisposition,
  appendVoicePatterns,
} from "./prompt-section";
import type {
  ApproachTendencies,
  Aspiration,
  AutonomyPreferences,
  CharacterInternalTraits,
  CharacterInternalTraitsInput,
  CopingMechanisms,
  MoralDisposition,
  VoicePatterns,
} from "./types";

// ── Defaults ───────────────────────────────────────────────

const DEFAULT_MORAL: MoralDisposition = { lawful_chaotic: 0, good_evil: 0, };
const DEFAULT_AUTONOMY: AutonomyPreferences = {
  group_comfort: 50,
  solo_comfort: 50,
  separation_triggers: [],
  reunion_triggers: [],
};
const DEFAULT_COPING: CopingMechanisms = {
  stress_response: "withdraws",
  failure_response: "tries again",
  conflict_style: "avoids",
};
const DEFAULT_APPROACH: ApproachTendencies = {
  decision_style: "cautious",
  risk_tolerance: 50,
  initiative_level: 50,
};
const DEFAULT_VOICE: VoicePatterns = {
  verbal_tics: [],
  vocabulary_level: "average",
  sentence_structure: "medium",
  humor_style: "none",
  emotional_range: 50,
};

// ── Row mapper ─────────────────────────────────────────────

interface InternalTraitsRow {
  id: string;
  actor_id: string;
  aspirations: string;
  moral_disposition: string;
  autonomy_preferences: string;
  coping_mechanisms: string;
  approach_tendencies: string;
  voice_patterns: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

/**
 * @param row
 */
function rowToTraits(row: InternalTraitsRow,): CharacterInternalTraits {
  return {
    id: row.id,
    actorId: row.actor_id,
    aspirations: jsonParseOr<Aspiration[]>(row.aspirations, [],),
    moralDisposition: jsonParseOr<MoralDisposition>(row.moral_disposition, DEFAULT_MORAL,),
    autonomyPreferences: jsonParseOr<AutonomyPreferences>(row.autonomy_preferences, DEFAULT_AUTONOMY,),
    copingMechanisms: jsonParseOr<CopingMechanisms>(row.coping_mechanisms, DEFAULT_COPING,),
    approachTendencies: jsonParseOr<ApproachTendencies>(row.approach_tendencies, DEFAULT_APPROACH,),
    voicePatterns: jsonParseOr<VoicePatterns>(row.voice_patterns, DEFAULT_VOICE,),
    visibility: jsonParseOr<string[]>(row.visibility, [],),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Service ────────────────────────────────────────────────

/** */
export class CharacterInternalTraitsService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get internal traits for an actor.
   * @param actorId
   */
  async get(actorId: string,): Promise<CharacterInternalTraits | null> {
    const row = await this.db
      .selectFrom("character_internal_traits",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirst();

    return row ? rowToTraits(row,) : null;
  }

  /**
   * Create or update internal traits for an actor.
   * @param actorId
   * @param input
   */
  async upsert(actorId: string, input: CharacterInternalTraitsInput,): Promise<CharacterInternalTraits> {
    const existing = await this.get(actorId,);
    const now = new Date().toISOString();

    if (existing) {
      await this.db
        .updateTable("character_internal_traits",)
        .set({
          aspirations: input.aspirations ? jsonStringifyOr(input.aspirations,) : undefined,
          moral_disposition: input.moralDisposition
            ? jsonStringifyOr({ ...existing.moralDisposition, ...input.moralDisposition, },)
            : undefined,
          autonomy_preferences: input.autonomyPreferences
            ? jsonStringifyOr({ ...existing.autonomyPreferences, ...input.autonomyPreferences, },)
            : undefined,
          coping_mechanisms: input.copingMechanisms
            ? jsonStringifyOr({ ...existing.copingMechanisms, ...input.copingMechanisms, },)
            : undefined,
          approach_tendencies: input.approachTendencies
            ? jsonStringifyOr({ ...existing.approachTendencies, ...input.approachTendencies, },)
            : undefined,
          voice_patterns: input.voicePatterns
            ? jsonStringifyOr({ ...existing.voicePatterns, ...input.voicePatterns, },)
            : undefined,
          visibility: input.visibility ? jsonStringifyOr(input.visibility,) : undefined,
          updated_at: now,
        },)
        .where("actor_id", "=", actorId,)
        .execute();

      const updated = await this.get(actorId,);
      if (!updated) { throw new Error("upsert: read-after-update returned null",); }
      return updated;
    }

    const id = crypto.randomUUID();
    await this.db
      .insertInto("character_internal_traits",)
      .values({
        id,
        actor_id: actorId,
        aspirations: jsonStringifyOr(input.aspirations ?? [],),
        moral_disposition: jsonStringifyOr({ ...DEFAULT_MORAL, ...input.moralDisposition, },),
        autonomy_preferences: jsonStringifyOr({ ...DEFAULT_AUTONOMY, ...input.autonomyPreferences, },),
        coping_mechanisms: jsonStringifyOr({ ...DEFAULT_COPING, ...input.copingMechanisms, },),
        approach_tendencies: jsonStringifyOr({ ...DEFAULT_APPROACH, ...input.approachTendencies, },),
        voice_patterns: jsonStringifyOr({ ...DEFAULT_VOICE, ...input.voicePatterns, },),
        visibility: jsonStringifyOr(input.visibility ?? [],),
        created_at: now,
        updated_at: now,
      },)
      .execute();

    const created = await this.get(actorId,);
    if (!created) { throw new Error("upsert: read-after-insert returned null",); }
    return created;
  }

  /**
   * Delete internal traits for an actor.
   * @param actorId
   */
  async delete(actorId: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("character_internal_traits",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  }

  /**
   * Generate a prompt assembly section for the character's internal traits.
   *
   * Only includes fields the character is open about (per visibility config).
   * Always includes hidden-state directives for the LLM to track internally.
   * @param actorId - The character's actor ID
   * @param includeHidden - If true, include ALL traits regardless of visibility (for GM/system use)
   */
  async buildPromptSection(actorId: string, includeHidden = false,): Promise<string | null> {
    const traits = await this.get(actorId,);
    if (!traits) { return null; }

    const lines: string[] = [];
    const vis = new Set(traits.visibility,);
    const isVisible = (field: string,) => includeHidden || vis.has(field,) || vis.has("*",);

    lines.push(
      "## Internal Character State",
      "",
      "You have internal states that influence your behavior. Some you share openly, others you keep private. Track these naturally — do not announce them unless contextually appropriate.",
      "",
    );

    appendAspirations(lines, traits.aspirations, isVisible,);
    appendMoralDisposition(lines, traits.moralDisposition, isVisible,);
    appendApproachTendencies(lines, traits.approachTendencies, isVisible,);
    appendVoicePatterns(lines, traits.voicePatterns, isVisible,);

    return lines.length > 3 ? lines.join("\n",) : null;
  }
}
