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
 *
 * The concrete CRUD / phase logic lives in isolated dispatcher module
 * (crud, phases) threaded with an explicit `db` handle. `EncounterService`
 * remains a class so its methods stay on the prototype.
 */
import type { Kysely, } from "kysely";
import type { NsfwEncounterType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import {
  createEncounter as createEncounterDispatch,
  deleteEncounter as deleteEncounterDispatch,
  getEncounter as getEncounterDispatch,
  listEncounters as listEncountersDispatch,
} from "./crud";
import { advancePhase as advancePhaseDispatch, } from "./phases";
import type {
  AdvancePhaseResult,
  CreateEncounterOpts,
  NsfwEncounter,
} from "./types";

export type {
  AdvancePhaseResult,
  ArousalEffect,
  CreateEncounterOpts,
  EncounterOutcome,
  EncounterPhase,
  NsfwEncounter,
  OutcomeEffects,
} from "./types";

// ── Service ────────────────────────────────────────────────

export class EncounterService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a new NSFW encounter.
   */
  async createEncounter(opts: CreateEncounterOpts,): Promise<NsfwEncounter> {
    return createEncounterDispatch(this.db, opts,);
  }

  /**
   * Get an encounter by ID.
   */
  async getEncounter(encounterId: string,): Promise<NsfwEncounter | null> {
    return getEncounterDispatch(this.db, encounterId,);
  }

  /**
   * Advance an encounter to the next phase.
   *
   * Returns triggered outcomes if the encounter completes.
   */
  async advancePhase(encounterId: string,): Promise<AdvancePhaseResult> {
    return advancePhaseDispatch(this.db, encounterId,);
  }

  /**
   * Get all encounters for a world.
   */
  async listEncounters(
    worldId: string,
    opts?: { completed?: boolean; type?: NsfwEncounterType },
  ): Promise<NsfwEncounter[]> {
    return listEncountersDispatch(this.db, worldId, opts,);
  }

  /**
   * Delete an encounter.
   */
  async deleteEncounter(encounterId: string,): Promise<boolean> {
    return deleteEncounterDispatch(this.db, encounterId,);
  }
}
