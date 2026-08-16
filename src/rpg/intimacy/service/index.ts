// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Intimacy Service
 *
 * Manages intimacy scores between characters:
 * - Intimacy levels and progression (0–100)
 * - Actions that build or lose intimacy
 * - Threshold events that unlock new interaction types
 * - History tracking for narrative context
 *
 * Intimacy is per-pair (actor ↔ target) and optionally per-world.
 *
 * The concrete logic lives in isolated dispatcher modules (pairs, actions,
 * levels) threaded with an explicit `db` handle. `IntimacyService` remains a
 * class so its methods stay on the prototype — `service.test.ts` stubs
 * `IntimacyService.prototype.*`, which requires a class.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import {
  applyAction as applyActionDispatch,
  decayAll as decayAllDispatch,
} from "./actions";
import { getLevelLabel as getLevelLabelDispatch, } from "./levels";
import {
  getActorPairs as getActorPairsDispatch,
  getPair as getPairDispatch,
} from "./pairs";
import type {
  ApplyIntimacyActionOpts,
  ApplyIntimacyResult,
  IntimacyPair,
} from "./types";

export { INTIMACY_THRESHOLDS, } from "./types";
export type {
  ApplyIntimacyActionOpts,
  ApplyIntimacyResult,
  IntimacyAction,
  IntimacyHistoryEntry,
  IntimacyPair,
  IntimacyThreshold,
} from "./types";

export class IntimacyService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get or create an intimacy pair between two actors.
   * Intimacy is symmetric — (A,B) and (B,A) share the same score.
   */
  async getPair(
    actorId: string,
    targetActorId: string,
    worldId: string | null = null,
  ): Promise<IntimacyPair> {
    return getPairDispatch(this.db, actorId, targetActorId, worldId,);
  }

  /**
   * Apply an intimacy action between two characters.
   *
   * Checks:
   * 1. Minimum intimacy requirement
   * 2. Relationship type allowlist (if defined)
   * 3. Consent flag (if action requires it)
   *
   * Updates score, records history, and fires threshold events.
   */
  async applyAction(opts: ApplyIntimacyActionOpts,): Promise<ApplyIntimacyResult> {
    return applyActionDispatch(this.db, opts,);
  }

  /**
   * Get all intimacy pairs for an actor (optionally in a world).
   */
  async getActorPairs(
    actorId: string,
    worldId?: string | null,
  ): Promise<IntimacyPair[]> {
    return getActorPairsDispatch(this.db, actorId, worldId,);
  }

  /**
   * Get the intimacy level label for a numeric score.
   */
  static getLevelLabel(score: number,): string {
    return getLevelLabelDispatch(score,);
  }

  /**
   * Decay intimacy over time (natural drift toward 0).
   *
   * @param decayAmount - How much to decay per call (default 1).
   */
  async decayAll(actorId: string, decayAmount = 1,): Promise<number> {
    return decayAllDispatch(this.db, actorId, decayAmount,);
  }
}
