/**
 * Encounter Service
 *
 * Manages structured NSFW encounters:
 * - Create encounters with phases and outcomes
 * - Advance through phases
 * - Track participants and content tags
 * - Record outcomes and completion
 *
 * Encounters are the mechanical framework for adult scenes.
 */
import type { Kysely, } from "kysely";
import type {
  ContentIntensity,
  NarrativeStyle,
  NsfwEncounterType,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { uid, } from "../../utils";

// ── Types ──────────────────────────────────────────────────

/** A phase within an encounter. */
export interface EncounterPhase {
  name: string;
  duration: number;
  actionsAvailable: string[];
  arousalEffects: ArousalEffect[];
  narrativeBeats: string[];
}

/** Arousal effect within a phase. */
export interface ArousalEffect {
  target: "self" | "partner" | "all";
  amount: number;
  condition?: string;
}

/** Possible outcome of an encounter. */
export interface EncounterOutcome {
  type: "satisfaction" | "dissatisfaction" | "injury" | "bonding" | "discovery";
  probability: number;
  effects: OutcomeEffects;
}

/** Effects of an encounter outcome. */
export interface OutcomeEffects {
  intimacyChange: number;
  moodChange: number;
  satisfactionBonus: number;
  memoryCreated: boolean;
  reputationChange: number;
}

/** An NSFW encounter record. */
export interface NsfwEncounter {
  id: string;
  worldId: string | null;
  encounterType: NsfwEncounterType;
  intensity: ContentIntensity;
  narrativeStyle: NarrativeStyle;
  participants: string[];
  phases: EncounterPhase[];
  currentPhase: number;
  outcomes: EncounterOutcome[];
  contentTags: string[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Options for creating an encounter. */
export interface CreateEncounterOpts {
  database: Kysely<DB>;
  worldId?: string | null;
  encounterType: NsfwEncounterType;
  intensity?: ContentIntensity;
  narrativeStyle?: NarrativeStyle;
  participants: string[];
  phases?: EncounterPhase[];
  outcomes?: EncounterOutcome[];
  contentTags?: string[];
}

/** Result of advancing an encounter phase. */
export interface AdvancePhaseResult {
  /** Whether the encounter is now complete. */
  complete: boolean;
  /** New current phase index. */
  phaseIndex: number;
  /** Current phase (null if complete). */
  phase: EncounterPhase | null;
  /** Triggered outcomes (if any). */
  triggeredOutcomes: EncounterOutcome[];
}

// ── Service ────────────────────────────────────────────────

export class EncounterService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a new NSFW encounter.
   */
  async createEncounter(opts: CreateEncounterOpts,): Promise<NsfwEncounter> {
    const { worldId, encounterType, intensity, narrativeStyle, participants, phases, outcomes, contentTags, } = opts;

    const id = uid();
    const now = new Date().toISOString();

    const defaultPhases: EncounterPhase[] = [
      {
        name: "Foreplay",
        duration: 3,
        actionsAvailable: ["kissing", "touching", "teasing",],
        arousalEffects: [{ target: "partner", amount: 15, },],
        narrativeBeats: ["Building tension...",],
      },
      {
        name: "Main",
        duration: 5,
        actionsAvailable: ["all",],
        arousalEffects: [{ target: "all", amount: 25, },],
        narrativeBeats: ["The encounter intensifies...",],
      },
      {
        name: "Aftercare",
        duration: 2,
        actionsAvailable: ["cuddling", "talking", "resting",],
        arousalEffects: [{ target: "all", amount: -10, },],
        narrativeBeats: ["A moment of calm...",],
      },
    ];

    const defaultOutcomes: EncounterOutcome[] = [
      {
        type: "satisfaction",
        probability: 0.7,
        effects: {
          intimacyChange: 5,
          moodChange: 10,
          satisfactionBonus: 15,
          memoryCreated: true,
          reputationChange: 0,
        },
      },
      {
        type: "dissatisfaction",
        probability: 0.2,
        effects: {
          intimacyChange: -2,
          moodChange: -5,
          satisfactionBonus: 0,
          memoryCreated: true,
          reputationChange: 0,
        },
      },
      {
        type: "bonding",
        probability: 0.1,
        effects: {
          intimacyChange: 10,
          moodChange: 15,
          satisfactionBonus: 20,
          memoryCreated: true,
          reputationChange: 0,
        },
      },
    ];

    await this.db
      .insertInto("nsfw_encounters",)
      .values({
        id,
        world_id: worldId ?? null,
        encounter_type: encounterType,
        intensity: intensity ?? "vanilla",
        narrative_style: narrativeStyle ?? "fade_to_black",
        participants: JSON.stringify(participants,),
        phases: JSON.stringify(phases ?? defaultPhases,),
        current_phase: 0,
        outcomes: JSON.stringify(outcomes ?? defaultOutcomes,),
        content_tags: JSON.stringify(contentTags ?? [],),
        completed: 0,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    const log = getLogger().child({ module: "encounters", },);
    log.info(`Encounter created: ${id} (${encounterType}, ${participants.length} participants)`,);

    return this.getRow({
      id,
      world_id: worldId ?? null,
      encounter_type: encounterType,
      intensity: intensity ?? "vanilla",
      narrative_style: narrativeStyle ?? "fade_to_black",
      participants: JSON.stringify(participants,),
      phases: JSON.stringify(phases ?? defaultPhases,),
      current_phase: 0,
      outcomes: JSON.stringify(outcomes ?? defaultOutcomes,),
      content_tags: JSON.stringify(contentTags ?? [],),
      completed: 0,
      created_at: now,
      updated_at: now,
    },);
  }

  /**
   * Get an encounter by ID.
   */
  async getEncounter(encounterId: string,): Promise<NsfwEncounter | null> {
    const row = await this.db
      .selectFrom("nsfw_encounters",)
      .where("id", "=", encounterId,)
      .selectAll()
      .executeTakeFirst();

    return row ? this.getRow(row,) : null;
  }

  /**
   * Advance an encounter to the next phase.
   *
   * Returns triggered outcomes if the encounter completes.
   */
  async advancePhase(encounterId: string,): Promise<AdvancePhaseResult> {
    const encounter = await this.getEncounter(encounterId,);
    if (!encounter) {
      return { complete: true, phaseIndex: 0, phase: null, triggeredOutcomes: [], };
    }

    const nextPhase = encounter.currentPhase + 1;
    const isComplete = nextPhase >= encounter.phases.length;

    if (isComplete) {
      // Roll for outcomes
      const triggered = this.rollOutcomes(encounter.outcomes,);

      // Apply outcomes
      await this.applyOutcomes(encounter, triggered,);

      // Mark complete
      const now = new Date().toISOString();
      await this.db
        .updateTable("nsfw_encounters",)
        .set({
          completed: 1,
          current_phase: nextPhase,
          updated_at: now,
        },)
        .where("id", "=", encounterId,)
        .execute();

      const log = getLogger().child({ module: "encounters", },);
      log.info(`Encounter ${encounterId} completed with ${triggered.length} outcomes`,);

      return {
        complete: true,
        phaseIndex: nextPhase,
        phase: null,
        triggeredOutcomes: triggered,
      };
    }

    // Move to next phase
    const now = new Date().toISOString();
    await this.db
      .updateTable("nsfw_encounters",)
      .set({
        current_phase: nextPhase,
        updated_at: now,
      },)
      .where("id", "=", encounterId,)
      .execute();

    return {
      complete: false,
      phaseIndex: nextPhase,
      phase: encounter.phases[nextPhase]!,
      triggeredOutcomes: [],
    };
  }

  /**
   * Get all encounters for a world.
   */
  async listEncounters(
    worldId: string,
    opts?: { completed?: boolean; type?: NsfwEncounterType },
  ): Promise<NsfwEncounter[]> {
    let query = this.db
      .selectFrom("nsfw_encounters",)
      .where("world_id", "=", worldId,)
      .orderBy("created_at", "desc",);

    if (opts?.completed !== undefined) {
      query = query.where("completed", "=", opts.completed ? 1 : 0,);
    }
    if (opts?.type) {
      query = query.where("encounter_type", "=", opts.type,);
    }

    const rows = await query.selectAll().execute();
    return rows.map((r,) => this.getRow(r,));
  }

  /**
   * Delete an encounter.
   */
  async deleteEncounter(encounterId: string,): Promise<boolean> {
    const result = await this.db
      .deleteFrom("nsfw_encounters",)
      .where("id", "=", encounterId,)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  }

  // ── Private helpers ───────────────────────────────────

  private getRow(row: {
    id: string;
    world_id: string | null;
    encounter_type: NsfwEncounterType;
    intensity: ContentIntensity;
    narrative_style: NarrativeStyle;
    participants: string;
    phases: string;
    current_phase: number;
    outcomes: string;
    content_tags: string;
    completed: number;
    created_at: string;
    updated_at: string;
  },): NsfwEncounter {
    return {
      id: row.id,
      worldId: row.world_id,
      encounterType: row.encounter_type,
      intensity: row.intensity,
      narrativeStyle: row.narrative_style,
      participants: JSON.parse(row.participants,) as string[],
      phases: JSON.parse(row.phases,) as EncounterPhase[],
      currentPhase: row.current_phase,
      outcomes: JSON.parse(row.outcomes,) as EncounterOutcome[],
      contentTags: JSON.parse(row.content_tags,) as string[],
      completed: row.completed === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Roll for outcomes based on probability. */
  private rollOutcomes(outcomes: EncounterOutcome[],): EncounterOutcome[] {
    const triggered: EncounterOutcome[] = [];
    for (const outcome of outcomes) {
      if (Math.random() < outcome.probability) {
        triggered.push(outcome,);
      }
    }
    return triggered;
  }

  /** Apply outcome effects (placeholder — would modify mood/intimacy). */
  private async applyOutcomes(
    encounter: NsfwEncounter,
    outcomes: EncounterOutcome[],
  ): Promise<void> {
    // Outcome effects would be applied to participants here
    // For now, just log them
    const log = getLogger().child({ module: "encounters", },);
    for (const outcome of outcomes) {
      log.info(
        `Encounter ${encounter.id} outcome: ${outcome.type} (intimacy ${
          outcome.effects.intimacyChange > 0 ? "+" : ""
        }${outcome.effects.intimacyChange})`,
      );
    }
  }
}
