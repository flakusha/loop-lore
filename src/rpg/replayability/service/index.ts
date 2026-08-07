/**
 * Replayability Service
 *
 * Manages new game plus, alternate story paths, multiple endings,
 * and meta-progression across playthroughs.
 *
 * The concrete logic lives in isolated dispatcher modules (playthrough,
 * endings, meta, ngp) threaded with an explicit `db` handle.
 * `ReplayabilityService` remains a class so its methods stay on the
 * prototype — `service.test.ts` stubs the prototype, which requires a class.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { completePlaythrough as completePlaythroughDispatch, } from "./endings";
import {
  getMetaProgression as getMetaProgressionDispatch,
} from "./meta";
import { startNewGamePlus as startNewGamePlusDispatch, } from "./ngp";
import {
  getPlayerPlaythroughs as getPlayerPlaythroughsDispatch,
  getPlaythrough as getPlaythroughDispatch,
  recordChoice as recordChoiceDispatch,
  recordSecretFound as recordSecretFoundDispatch,
  startPlaythrough as startPlaythroughDispatch,
} from "./playthrough";
import type {
  CreatePlaythroughInput,
  EndingType,
  MetaProgression,
  NewGamePlusInput,
  Playthrough,
} from "./types";

export type {
  CreatePlaythroughInput,
  Ending,
  EndingCondition,
  EndingReward,
  MetaProgression,
  NewGamePlusInput,
  PermanentBonus,
  Playthrough,
} from "./types";
export { EndingType, PlusDifficulty, } from "./types";

/** Replayability Service */
export class ReplayabilityService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Start a new playthrough
   */
  async startPlaythrough(input: CreatePlaythroughInput,): Promise<Playthrough> {
    return startPlaythroughDispatch(this.db, input,);
  }

  /**
   * Get playthrough by ID
   */
  async getPlaythrough(playthroughId: string,): Promise<Playthrough | null> {
    return getPlaythroughDispatch(this.db, playthroughId,);
  }

  /**
   * Get all playthroughs for a player
   */
  async getPlayerPlaythroughs(playerId: string, worldId?: string,): Promise<Playthrough[]> {
    return getPlayerPlaythroughsDispatch(this.db, playerId, worldId,);
  }

  /**
   * Complete a playthrough with an ending
   */
  async completePlaythrough(
    playthroughId: string,
    endingId: string,
    endingType: EndingType,
    completionTime: number,
  ): Promise<Playthrough> {
    return completePlaythroughDispatch(this.db, playthroughId, endingId, endingType, completionTime,);
  }

  /**
   * Start new game plus
   */
  async startNewGamePlus(input: NewGamePlusInput,): Promise<Playthrough> {
    return startNewGamePlusDispatch(this.db, input,);
  }

  /**
   * Record a choice made during playthrough
   */
  async recordChoice(playthroughId: string,): Promise<void> {
    return recordChoiceDispatch(this.db, playthroughId,);
  }

  /**
   * Record a secret found during playthrough
   */
  async recordSecretFound(playthroughId: string, secretId: string,): Promise<void> {
    return recordSecretFoundDispatch(this.db, playthroughId, secretId,);
  }

  /**
   * Get meta-progression for a player
   */
  async getMetaProgression(playerId: string,): Promise<MetaProgression> {
    return getMetaProgressionDispatch(this.db, playerId,);
  }
}
