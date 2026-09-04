// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Service — internal types.
 *
 * Service-internal types only. Public contracts live in
 * `../../spec/growth.ts`. This file holds:
 * - Row mapper input types (DB column shape)
 * - Service-layer error types
 * - Approval context (used by confirm/reject APIs)
 *
 * Per AGENTS.md, services MUST NOT import DB-specific modules — this
 * file imports Kysely types (DB is the typed aggregate) but never
 * touches the SQLite/PG dialects.
 */
import type { GrowthAxis, GrowthEntryStatus, GrowthEventType, } from "../../spec/growth";

/** Raw row shape as stored in `character_arc`. Service-internal. */
export interface CharacterArcRow {
  id: string;
  actor_id: string;
  current_stage: string;
  stage_description: string | null;
  updated_at: string;
}

/** Raw row shape as stored in `growth_log`. Service-internal. */
export interface GrowthLogRow {
  id: string;
  actor_id: string;
  axis: string;
  event_type: string;
  status: string;
  subject_kind: string | null;
  subject_id: string | null;
  before_json: string | null;
  after_json: string | null;
  reason: string;
  source_event_id: string | null;
  recorded_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
}

/** Cached growth mode fetched alongside the actor. */
export interface GrowthModeSnapshot {
  growthMode: "dynamic" | "static";
  llmAssistEnabled: boolean;
}

/** Options for listing growth log entries. */
export interface ListGrowthLogOpts {
  axis?: GrowthAxis;
  status?: GrowthEntryStatus;
  limit?: number;
  /** When true, include `pending` rows. Default false (player view). */
  includePending?: boolean;
}

/** Options for confirming a pending growth entry. */
export interface ConfirmGrowthEntryOpts {
  entryId: string;
  actorId: string;
  confirmedBy: string;
}

/** Options for rejecting a pending growth entry. */
export interface RejectGrowthEntryOpts {
  entryId: string;
  actorId: string;
  rejectedBy: string;
}

/** Service-layer error class. Distinct from HTTP errors. */
export class GrowthServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "static_mode_forbidden"
      | "integrity_forbidden"
      | "not_found"
      | "already_resolved"
      | "invalid_input",
  ) {
    super(message,);
    this.name = "GrowthServiceError";
  }
}

/** Event types that require an explicit author/GM override to record
 *  even on static characters (D4). */
export const AUTHOR_ONLY_EVENT_TYPES: ReadonlySet<GrowthEventType> = new Set([
  "arc_stage_set" as GrowthEventType,
],);
