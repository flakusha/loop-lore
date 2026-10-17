// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/factions-diplomacy.ts — the diplomatic verbs: war, peace,
 * alliance, betrayal (epic-world-diplomacy-karma).
 *
 * Each verb is a thin guard plus one `setRelationship` call, which is
 * where the transition rule and the history append live. The guards here
 * exist for the transitions that are legal but not unconditional:
 * peace only applies to a pair that is actually fighting, and only an
 * allied pair can break its alliance.
 */
import type { Kysely, } from "kysely";
import type { FactionDiplomaticStatus, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import type { FactionRelationship, } from "./factions";
import { FactionError, } from "./factions";
import { getFactionRelationship, setRelationship, } from "./factions-relationships";

/** Common request shape for every diplomatic verb. */
export interface DiplomaticActionOptions {
  db: Kysely<DB>;
  factionA: string;
  factionB: string;
  /** Free-text justification appended to the pair's history. */
  reason?: string;
  now?: Date;
}

/** Statuses a peace negotiation can be offered from. */
const AT_WAR_STATUSES: ReadonlySet<FactionDiplomaticStatus> = new Set(["hostile", "at_war",],);

/** Score an allied pair holds. */
const ALLIANCE_FLOOR = 60;

/** Score an alliance-breaking betrayal leaves behind (the `unfriendly` band). */
const BETRAYAL_SCORE = -40;

/**
 * Declare war: the pair drops to `at_war` with the floor score.
 * @param options pair ids plus the reason recorded in history
 * @returns the relationship after the declaration
 */
export async function declareWar(
  options: DiplomaticActionOptions,
): Promise<FactionRelationship> {
  return setRelationship({
    db: options.db,
    factionA: options.factionA,
    factionB: options.factionB,
    status: "at_war",
    deltaStanding: -100,
    action: "declare_war",
    reason: options.reason,
    now: options.now,
  },);
}

/**
 * Negotiate a peace: `hostile`/`at_war` → `neutral`, score reset to 0.
 * @param options pair ids plus the reason recorded in history
 * @returns the relationship after the peace
 * @throws {FactionError} invalid-transition when the pair is not fighting
 */
export async function proposePeace(
  options: DiplomaticActionOptions,
): Promise<FactionRelationship> {
  const current = await getFactionRelationship(options.db, options.factionA, options.factionB,);
  const status = current?.status ?? "neutral";
  if (!AT_WAR_STATUSES.has(status,)) {
    throw new FactionError("invalid-transition", `cannot negotiate peace while ${status}`,);
  }

  return setRelationship({
    db: options.db,
    factionA: options.factionA,
    factionB: options.factionB,
    status: "neutral",
    // Reset the pair score to exactly 0 (neutral), whatever the war left.
    deltaStanding: -(current?.standing ?? 0),
    action: "peace",
    reason: options.reason,
    now: options.now,
  },);
}

/**
 * Form an alliance: the pair becomes `allied` at the alliance floor.
 * Rejected while the pair is `hostile`/`at_war` — peace first.
 * @param options pair ids plus the reason recorded in history
 * @returns the relationship after the pact
 * @throws {FactionError} invalid-transition while the pair is at war
 */
export async function formAlliance(
  options: DiplomaticActionOptions,
): Promise<FactionRelationship> {
  const current = await getFactionRelationship(options.db, options.factionA, options.factionB,);

  return setRelationship({
    db: options.db,
    factionA: options.factionA,
    factionB: options.factionB,
    status: "allied",
    // Land the score exactly on the alliance floor so the explicit status
    // and the score-derived status can never disagree.
    deltaStanding: ALLIANCE_FLOOR - (current?.standing ?? 0),
    action: "alliance",
    reason: options.reason,
    now: options.now,
  },);
}

/**
 * Break an alliance: `allied` → `unfriendly`.
 * @param options pair ids plus the reason recorded in history
 * @returns the relationship after the break
 * @throws {FactionError} invalid-transition when the pair is not allied
 */
export async function breakAlliance(
  options: DiplomaticActionOptions,
): Promise<FactionRelationship> {
  const current = await getFactionRelationship(options.db, options.factionA, options.factionB,);
  const status = current?.status ?? "neutral";
  if (status !== "allied") {
    throw new FactionError("invalid-transition", `cannot break an alliance while ${status}`,);
  }

  return setRelationship({
    db: options.db,
    factionA: options.factionA,
    factionB: options.factionB,
    status: "unfriendly",
    deltaStanding: BETRAYAL_SCORE - (current?.standing ?? 0),
    action: "break_alliance",
    reason: options.reason,
    now: options.now,
  },);
}
