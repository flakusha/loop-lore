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

/** */
export class IntimacyService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Get or create an intimacy pair between two actors.
   * Intimacy is symmetric — (A,B) and (B,A) share the same score.
   * @param actorId
   * @param targetActorId
   * @param worldId
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
   * @param opts
   */
  async applyAction(opts: ApplyIntimacyActionOpts,): Promise<ApplyIntimacyResult> {
    return applyActionDispatch(this.db, opts,);
  }

  /**
   * TASK-033 named signature: apply an interaction and return the post-delta
   * intimacy level (a score on the `IntimacyLevel` enum).
   *
   * Routes through {@link applyAction} so the NSFW capability gate, CHA/WIS
   * stat modifiers, and threshold events fire identically. Bypassing the gate
   * is impossible from this surface — the gate is enforced inside the
   * dispatcher when `opts.gate` is supplied.
   * @param actor - Initiating actor id.
   * @param target - Target actor id.
   * @param action - The intimacy action descriptor.
   * @param worldId - Optional world scope (null = cross-world).
   * @returns Post-delta intimacy score.
   * @throws {CapabilityBlockedError} when the NSFW gate denies the action.
   */
  async applyInteraction(
    actor: string,
    target: string,
    action: ApplyIntimacyActionOpts["action"],
    worldId?: string | null,
  ): Promise<number> {
    const result = await this.applyAction({
      database: this.db,
      actorId: actor,
      targetActorId: target,
      worldId: worldId ?? null,
      action,
    },);
    return result.newScore;
  }

  /**
   * Get all intimacy pairs for an actor (optionally in a world).
   * @param actorId
   * @param worldId
   */
  async getActorPairs(
    actorId: string,
    worldId?: string | null,
  ): Promise<IntimacyPair[]> {
    return getActorPairsDispatch(this.db, actorId, worldId,);
  }

  /**
   * Get the intimacy level label for a numeric score.
   * @param score
   */
  static getLevelLabel(score: number,): string {
    return getLevelLabelDispatch(score,);
  }

  /**
   * Decay intimacy over time (natural drift toward 0).
   * @param actorId
   * @param decayAmount - How much to decay per call (default 1).
   */
  async decayAll(actorId: string, decayAmount = 1,): Promise<number> {
    return decayAllDispatch(this.db, actorId, decayAmount,);
  }
}
