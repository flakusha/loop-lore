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
 */
import type { Kysely, } from "kysely";
import type { IntimacyActionType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { nowAndId, parseJsonField, } from "../shared/rpg-service-utils";

// ── Constants ──────────────────────────────────────────────

/** Intimacy score boundaries for level classification. */
export const INTIMACY_THRESHOLDS = {
  strangers: 0,
  acquaintances: 10,
  friends: 25,
  closeFriends: 40,
  romanticInterest: 55,
  dating: 70,
  intimate: 85,
  soulbonded: 100,
} as const;

/** Maximum intimacy score. */
const MAX_SCORE = 100;

/** Minimum intimacy score. */
const MIN_SCORE = 0;

/** Maximum history entries kept per pair. */
const MAX_HISTORY = 50;

// ── Types ──────────────────────────────────────────────────

/** An intimacy action that affects the score. */
export interface IntimacyAction {
  id: string;
  name: string;
  type: IntimacyActionType;
  /** Score delta (positive = build, negative = lose). */
  delta: number;
  /** Minimum intimacy required to perform this action. */
  minIntimacy: number;
  /** Optional: relationship types that allow this action. */
  allowedRelationships?: string[];
  /** Whether consent is required for this action. */
  requiresConsent: boolean;
}

/** Threshold event fired when intimacy reaches a level. */
export interface IntimacyThreshold {
  level: number;
  label: string;
  unlock: string;
  npcReaction: string;
  gameplayEffects: string[];
}

/** A recorded intimacy action in history. */
export interface IntimacyHistoryEntry {
  actionId: string;
  actionName: string;
  delta: number;
  timestamp: string;
  context?: string;
}

/** Intimacy pair result from DB. */
export interface IntimacyPair {
  id: string;
  actorId: string;
  targetActorId: string;
  worldId: string | null;
  score: number;
  actionHistory: IntimacyHistoryEntry[];
  unlockedThresholds: number[];
  createdAt: string;
  updatedAt: string;
}

/** Options for applying an intimacy action. */
export interface ApplyIntimacyActionOpts {
  database: Kysely<DB>;
  actorId: string;
  targetActorId: string;
  worldId?: string | null;
  action: IntimacyAction;
  context?: string;
}

/** Result of applying an intimacy action. */
export interface ApplyIntimacyResult {
  /** New intimacy score after applying the action. */
  newScore: number;
  /** Score change (may be modified by conditions). */
  actualDelta: number;
  /** Whether the action was applied. */
  applied: boolean;
  /** Reason if not applied. */
  reason?: string;
  /** Threshold events that fired. */
  thresholdsReached: IntimacyThreshold[];
  /** Whether the pair's relationship type should upgrade. */
  suggestedRelationshipUpgrade?: string;
}

// ── Service ────────────────────────────────────────────────

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
    const row = await this.db
      .selectFrom("character_intimacy",)
      .where("actor_id", "=", actorId,)
      .where("target_actor_id", "=", targetActorId,)
      .where("world_id", "is", worldId,)
      .selectAll()
      .executeTakeFirst();

    if (row) {
      return this.rowToPair(row,);
    }

    // Create new pair with score 0
    const { id, now, } = nowAndId();

    await this.db
      .insertInto("character_intimacy",)
      .values({
        id,
        actor_id: actorId,
        target_actor_id: targetActorId,
        world_id: worldId,
        score: 0,
        action_history: "[]",
        unlocked_thresholds: "[]",
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return {
      id,
      actorId,
      targetActorId,
      worldId,
      score: 0,
      actionHistory: [],
      unlockedThresholds: [],
      createdAt: now,
      updatedAt: now,
    };
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
    const { database, actorId, targetActorId, worldId, action, context, } = opts;
    const log = getLogger().child({ module: "intimacy", },);

    const pair = await this.getPair(actorId, targetActorId, worldId,);

    // Check minimum intimacy
    if (pair.score < action.minIntimacy) {
      return {
        newScore: pair.score,
        actualDelta: 0,
        applied: false,
        reason: `Intimacy too low: ${pair.score}/${action.minIntimacy}`,
        thresholdsReached: [],
      };
    }

    // Check relationship type allowlist
    if (action.allowedRelationships && action.allowedRelationships.length > 0) {
      const relationship = await database
        .selectFrom("character_relationships",)
        .select("relationship_type",)
        .where("actor_id", "=", actorId,)
        .where("target_actor_id", "=", targetActorId,)
        .executeTakeFirst();

      if (!relationship || !action.allowedRelationships.includes(relationship.relationship_type,)) {
        return {
          newScore: pair.score,
          actualDelta: 0,
          applied: false,
          reason: "Relationship type not allowed for this action",
          thresholdsReached: [],
        };
      }
    }

    // Apply delta with bounds
    const newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, pair.score + action.delta,),);
    const actualDelta = newScore - pair.score;

    // Record history
    const history: IntimacyHistoryEntry[] = [
      ...pair.actionHistory,
      {
        actionId: action.id,
        actionName: action.name,
        delta: actualDelta,
        timestamp: new Date().toISOString(),
        context,
      },
    ].slice(-MAX_HISTORY,);

    // Check for threshold events
    const thresholdsReached = this.checkThresholds(pair.score, newScore, pair.unlockedThresholds,);

    // Update unlocked thresholds
    const newUnlocked = [
      ...pair.unlockedThresholds,
      ...thresholdsReached.map((t,) => t.level),
    ];

    // Determine suggested relationship upgrade
    const suggestedRelationshipUpgrade = this.suggestRelationshipUpgrade(newScore,);

    // Persist
    const now = new Date().toISOString();
    await this.db
      .updateTable("character_intimacy",)
      .set({
        score: newScore,
        action_history: JSON.stringify(history,),
        unlocked_thresholds: JSON.stringify(newUnlocked,),
        updated_at: now,
      },)
      .where("id", "=", pair.id,)
      .execute();

    log.info(`Intimacy ${actorId}↔${targetActorId}: ${pair.score}→${newScore} (${action.name})`,);

    return {
      newScore,
      actualDelta,
      applied: true,
      thresholdsReached,
      suggestedRelationshipUpgrade,
    };
  }

  /**
   * Get all intimacy pairs for an actor (optionally in a world).
   */
  async getActorPairs(
    actorId: string,
    worldId?: string | null,
  ): Promise<IntimacyPair[]> {
    let query = this.db
      .selectFrom("character_intimacy",)
      .where("actor_id", "=", actorId,)
      .orderBy("score", "desc",);

    if (worldId !== undefined && worldId !== null) {
      query = query.where("world_id", "=", worldId,);
    } else if (worldId === null) {
      query = query.where("world_id", "is", null,);
    }

    const rows = await query.selectAll().execute();
    return rows.map((r,) => this.rowToPair(r,));
  }

  /**
   * Get the intimacy level label for a numeric score.
   */
  static getLevelLabel(score: number,): string {
    if (score >= INTIMACY_THRESHOLDS.soulbonded) { return "Soulbonded"; }
    if (score >= INTIMACY_THRESHOLDS.intimate) { return "Intimate"; }
    if (score >= INTIMACY_THRESHOLDS.dating) { return "Dating"; }
    if (score >= INTIMACY_THRESHOLDS.romanticInterest) { return "Romantic Interest"; }
    if (score >= INTIMACY_THRESHOLDS.closeFriends) { return "Close Friends"; }
    if (score >= INTIMACY_THRESHOLDS.friends) { return "Friends"; }
    if (score >= INTIMACY_THRESHOLDS.acquaintances) { return "Acquaintances"; }
    return "Strangers";
  }

  /**
   * Decay intimacy over time (natural drift toward 0).
   *
   * @param decayAmount - How much to decay per call (default 1).
   */
  async decayAll(actorId: string, decayAmount = 1,): Promise<number> {
    const pairs = await this.db
      .selectFrom("character_intimacy",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .execute();

    let affected = 0;

    for (const pair of pairs) {
      if (pair.score <= 0) { continue; }

      const newScore = Math.max(MIN_SCORE, pair.score - decayAmount,);
      if (newScore === pair.score) { continue; }

      const now = new Date().toISOString();
      await this.db
        .updateTable("character_intimacy",)
        .set({ score: newScore, updated_at: now, },)
        .where("id", "=", pair.id,)
        .execute();

      affected++;
    }

    return affected;
  }

  // ── Private helpers ────────────────────────────────────

  /** Convert a DB row to an IntimacyPair. */
  private rowToPair(row: {
    id: string;
    actor_id: string;
    target_actor_id: string;
    world_id: string | null;
    score: number;
    action_history: string;
    unlocked_thresholds: string;
    created_at: string;
    updated_at: string;
  },): IntimacyPair {
    return {
      id: row.id,
      actorId: row.actor_id,
      targetActorId: row.target_actor_id,
      worldId: row.world_id,
      score: row.score,
      actionHistory: parseJsonField<IntimacyHistoryEntry[]>(row.action_history, [],),
      unlockedThresholds: parseJsonField<number[]>(row.unlocked_thresholds, [],),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Check which threshold events fire when moving from oldScore to newScore. */
  private checkThresholds(
    oldScore: number,
    newScore: number,
    alreadyUnlocked: number[],
  ): IntimacyThreshold[] {
    const reached: IntimacyThreshold[] = [];

    for (const [label, level,] of Object.entries(INTIMACY_THRESHOLDS,)) {
      if (alreadyUnlocked.includes(level,)) { continue; }
      if (oldScore < level && newScore >= level) {
        reached.push({
          level,
          label,
          unlock: `New interactions unlocked at ${label} level`,
          npcReaction: `${label} threshold reached`,
          gameplayEffects: [`Intimacy level: ${label}`,],
        },);
      }
    }

    return reached;
  }

  /** Suggest relationship type upgrade based on intimacy score. */
  private suggestRelationshipUpgrade(score: number,): string | undefined {
    if (score >= INTIMACY_THRESHOLDS.intimate) { return "romantic"; }
    if (score >= INTIMACY_THRESHOLDS.dating) { return "romantic_interest"; }
    if (score >= INTIMACY_THRESHOLDS.closeFriends) { return "friend"; }
    return undefined;
  }
}
