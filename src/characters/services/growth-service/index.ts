// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth & Arc Progression — public service API.
 *
 * See `.plan/epics/epic-character-growth.md`.
 *
 * Single dependency direction: bridges (skills / traits / relationships)
 * call into this service; this service never imports from the source
 * services' modules — it only writes growth_log rows. The growth
 * prompt section reads through this service.
 *
 * Per AGENTS.md: services MUST NOT import DB-specific modules. The
 * service receives a typed `Kysely<DB>` handle and uses Kysely's
 * portable query builder.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type {
  CharacterArc,
  GrowthLogEntry,
  InsertGrowthLogInput,
  UpsertArcInput,
} from "../../spec/growth";
import {
  confirmGrowthEntry,
  getArc,
  getGrowthMode,
  insertGrowthLog,
  listGrowthLog,
  rejectGrowthEntry,
  upsertArc,
} from "./crud";
import type {
  ConfirmGrowthEntryOpts,
  GrowthModeSnapshot,
  ListGrowthLogOpts,
  RejectGrowthEntryOpts,
} from "./types";

/**
 * CharacterGrowthService — public API for character growth bookkeeping.
 *
 * Construct with a `Kysely<DB>` and call the methods directly. The
 * class is intentionally thin: it re-exports the CRUD dispatchers
 * with stable signatures, and is the documented surface for callers
 * (routes, prompt sections, bridges).
 */
export class CharacterGrowthService {
  /** */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Read the growth_mode + llm_assist_enabled flags for an actor.
   * @param actorId
   */
  async getGrowthMode(actorId: string,): Promise<GrowthModeSnapshot> {
    return getGrowthMode(this.db, actorId,);
  }

  /**
   * Get the current arc for an actor, or null if none has been authored.
   * @param actorId
   */
  async getArc(actorId: string,): Promise<CharacterArc | null> {
    return getArc(this.db, actorId,);
  }

  /**
   * Upsert an actor's arc stage. Writes an `arc_stage_set` growth_log
   * row so the audit trail is complete.
   * @param input
   * @param confirmedBy - User id of the actor setting the stage.
   */
  async upsertArc(input: UpsertArcInput, confirmedBy: string,): Promise<CharacterArc> {
    return upsertArc(this.db, input, confirmedBy,);
  }

  /**
   * Insert a growth_log row. Enforces static-mode refusal (D4) and
   * returns the persisted row.
   * @param input
   */
  async insertGrowthLog(input: InsertGrowthLogInput,): Promise<GrowthLogEntry> {
    return insertGrowthLog(this.db, input,);
  }

  /**
   * List growth log entries for an actor, most recent first.
   * @param actorId
   * @param opts
   */
  async listGrowthLog(
    actorId: string,
    opts?: ListGrowthLogOpts,
  ): Promise<GrowthLogEntry[]> {
    return listGrowthLog(this.db, actorId, opts,);
  }

  /**
   * Confirm a pending growth_log entry (D6).
   * @param opts
   */
  async confirmGrowthEntry(opts: ConfirmGrowthEntryOpts,): Promise<GrowthLogEntry> {
    return confirmGrowthEntry(this.db, opts,);
  }

  /**
   * Reject a pending growth_log entry (D6).
   * @param opts
   */
  async rejectGrowthEntry(opts: RejectGrowthEntryOpts,): Promise<GrowthLogEntry> {
    return rejectGrowthEntry(this.db, opts,);
  }
}

/** Default factory — used by routes and prompt sections. */
export function characterGrowthService(db: Kysely<DB>,): CharacterGrowthService {
  return new CharacterGrowthService(db,);
}
export { runLlmAssist, } from "./llm-assist";
export type { RunLlmAssistOpts, } from "./llm-assist";
export {
  redactArcForPlayerCard,
  redactGrowthLogEntry,
  redactGrowthLogForPlayerCard,
} from "./redact";
export type { GrowthRedactionViewer, PublicCharacterArc, PublicGrowthLogEntry, } from "./redact";
export { GrowthServiceError, } from "./types";
export type {
  ConfirmGrowthEntryOpts,
  GrowthModeSnapshot,
  ListGrowthLogOpts,
  RejectGrowthEntryOpts,
} from "./types";
