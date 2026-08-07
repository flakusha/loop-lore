/**
 * Replayability Service
 *
 * Manages new game plus, alternate story paths, multiple endings,
 * and meta-progression across playthroughs.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { getLogger, } from "../../logger";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";

function getLog() {
  return getLogger().child({ module: "replayability", },);
}

/** New game plus difficulty modifiers */
export const PlusDifficulty = {
  Normal: "normal",
  Hard: "hard",
  Nightmare: "nightmare",
  Custom: "custom",
} as const;
export type PlusDifficulty = (typeof PlusDifficulty)[keyof typeof PlusDifficulty];

/** Ending types */
export const EndingType = {
  Good: "good",
  Neutral: "neutral",
  Bad: "bad",
  Secret: "secret",
  True: "true",
} as const;
export type EndingType = (typeof EndingType)[keyof typeof EndingType];

/** Playthrough data */
export interface Playthrough {
  id: string;
  playerId: string;
  worldId: string;
  playthroughNumber: number;
  difficulty: PlusDifficulty;
  isCompleted: boolean;
  endingId: string | null;
  endingType: EndingType | null;
  completionTime: number; // seconds
  choicesMade: number;
  secretsFound: number;
  achievementsUnlocked: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** Ending definition */
export interface Ending {
  id: string;
  name: string;
  description: string;
  type: EndingType;
  conditions: EndingCondition[];
  rewards: EndingReward[];
  isSecret: boolean;
  metadata: Record<string, unknown>;
}

/** Ending unlock conditions */
export interface EndingCondition {
  type: "choice" | "quest" | "achievement" | "relationship" | "time" | "custom";
  target: string;
  value: unknown;
  operator: "equals" | "greater" | "less" | "contains";
}

/** Ending reward */
export interface EndingReward {
  type: "unlock" | "achievement" | "cosmetic" | "meta_progression";
  value: unknown;
  description: string;
}

/** Meta-progression data */
export interface MetaProgression {
  playerId: string;
  totalPlaythroughs: number;
  endingsSeen: string[];
  secretsFound: string[];
  achievementsUnlocked: string[];
  permanentBonuses: PermanentBonus[];
  unlockedContent: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
}

/** Permanent bonus from meta-progression */
export interface PermanentBonus {
  id: string;
  name: string;
  description: string;
  type: "stat" | "ability" | "item" | "unlock";
  value: unknown;
  source: string; // which ending/achievement granted this
}

/** Playthrough creation input */
export interface CreatePlaythroughInput {
  playerId: string;
  worldId: string;
  difficulty?: PlusDifficulty;
  metadata?: Record<string, unknown>;
}

/** New game plus input */
export interface NewGamePlusInput {
  playerId: string;
  worldId: string;
  previousPlaythroughId: string;
  difficulty?: PlusDifficulty;
  carryOverChoices?: boolean;
  carryOverItems?: boolean;
}

/** Replayability Service */
export class ReplayabilityService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Start a new playthrough
   */
  async startPlaythrough(input: CreatePlaythroughInput,): Promise<Playthrough> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    // Get playthrough number
    const existingCount = await this.getPlaythroughCount(input.playerId, input.worldId,);

    const playthroughData = {
      id,
      player_id: input.playerId,
      world_id: input.worldId,
      playthrough_number: existingCount + 1,
      difficulty: input.difficulty ?? PlusDifficulty.Normal,
      is_completed: false,
      ending_id: null,
      ending_type: null,
      completion_time: 0,
      choices_made: 0,
      secrets_found: 0,
      achievements_unlocked: 0,
      metadata: jsonStringifyOr(input.metadata ?? {},),
      created_at: now,
      updated_at: now,
      completed_at: null,
    };

    await (this.db as any).insertInto("playthroughs",).values(playthroughData,).execute();

    getLog().info("Playthrough started", {
      id,
      playerId: input.playerId,
      worldId: input.worldId,
      playthroughNumber: existingCount + 1,
    },);

    return this.rowToPlaythrough(playthroughData,);
  }

  /**
   * Get playthrough by ID
   */
  async getPlaythrough(playthroughId: string,): Promise<Playthrough | null> {
    const row = await (this.db as any)
      .selectFrom("playthroughs",)
      .where("id", "=", playthroughId,)
      .selectAll()
      .executeTakeFirst();

    return row ? this.rowToPlaythrough(row,) : null;
  }

  /**
   * Get all playthroughs for a player
   */
  async getPlayerPlaythroughs(playerId: string, worldId?: string,): Promise<Playthrough[]> {
    let query = (this.db as any)
      .selectFrom("playthroughs",)
      .where("player_id", "=", playerId,)
      .orderBy("playthrough_number", "desc",);

    if (worldId) {
      query = query.where("world_id", "=", worldId,);
    }

    const rows = await query.selectAll().execute();
    return Array.from(rows, (row: any,) => this.rowToPlaythrough(row,),);
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
    const playthrough = await this.getPlaythrough(playthroughId,);
    if (!playthrough) { throw new Error("Playthrough not found",); }
    if (playthrough.isCompleted) { throw new Error("Playthrough already completed",); }

    const now = new Date().toISOString();

    await (this.db as any)
      .updateTable("playthroughs",)
      .set({
        is_completed: true,
        ending_id: endingId,
        ending_type: endingType,
        completion_time: completionTime,
        completed_at: now,
        updated_at: now,
      },)
      .where("id", "=", playthroughId,)
      .execute();

    // Update meta-progression
    await this.updateMetaProgression(playthrough.playerId, endingId, endingType,);

    getLog().info("Playthrough completed", {
      playthroughId,
      endingId,
      endingType,
      completionTime,
    },);

    return (await this.getPlaythrough(playthroughId,))!;
  }

  /**
   * Start new game plus
   */
  async startNewGamePlus(input: NewGamePlusInput,): Promise<Playthrough> {
    const previousPlaythrough = await this.getPlaythrough(input.previousPlaythroughId,);
    if (!previousPlaythrough) { throw new Error("Previous playthrough not found",); }
    if (!previousPlaythrough.isCompleted) { throw new Error("Previous playthrough not completed",); }

    const newPlaythrough = await this.startPlaythrough({
      playerId: input.playerId,
      worldId: input.worldId,
      difficulty: input.difficulty ?? PlusDifficulty.Hard,
      metadata: {
        isNewGamePlus: true,
        previousPlaythroughId: input.previousPlaythroughId,
        carryOverChoices: input.carryOverChoices ?? true,
        carryOverItems: input.carryOverItems ?? false,
      },
    },);

    getLog().info("New game plus started", {
      newPlaythroughId: newPlaythrough.id,
      previousPlaythroughId: input.previousPlaythroughId,
      difficulty: input.difficulty,
    },);

    return newPlaythrough;
  }

  /**
   * Record a choice made during playthrough
   */
  async recordChoice(playthroughId: string,): Promise<void> {
    await (this.db as any)
      .updateTable("playthroughs",)
      .set({
        choices_made: (this.db as any).raw("choices_made + 1",),
        updated_at: new Date().toISOString(),
      },)
      .where("id", "=", playthroughId,)
      .execute();
  }

  /**
   * Record a secret found during playthrough
   */
  async recordSecretFound(playthroughId: string, secretId: string,): Promise<void> {
    const playthrough = await this.getPlaythrough(playthroughId,);
    if (!playthrough) { throw new Error("Playthrough not found",); }

    const secrets = this.parseJsonField<string[]>(playthrough.metadata.secrets ?? [], [],);
    if (!secrets.includes(secretId,)) {
      secrets.push(secretId,);
    }

    await (this.db as any)
      .updateTable("playthroughs",)
      .set({
        secrets_found: secrets.length,
        metadata: jsonStringifyOr({
          ...playthrough.metadata,
          secrets,
        },),
        updated_at: new Date().toISOString(),
      },)
      .where("id", "=", playthroughId,)
      .execute();
  }

  /**
   * Get meta-progression for a player
   */
  async getMetaProgression(playerId: string,): Promise<MetaProgression> {
    const row = await (this.db as any)
      .selectFrom("meta_progression",)
      .where("player_id", "=", playerId,)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return {
        playerId,
        totalPlaythroughs: 0,
        endingsSeen: [],
        secretsFound: [],
        achievementsUnlocked: [],
        permanentBonuses: [],
        unlockedContent: [],
        metadata: {},
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      playerId: row.player_id,
      totalPlaythroughs: row.total_playthroughs,
      endingsSeen: this.parseJsonField<string[]>(row.endings_seen, [],),
      secretsFound: this.parseJsonField<string[]>(row.secrets_found, [],),
      achievementsUnlocked: this.parseJsonField<string[]>(row.achievements_unlocked, [],),
      permanentBonuses: this.parseJsonField<PermanentBonus[]>(row.permanent_bonuses, [],),
      unlockedContent: this.parseJsonField<string[]>(row.unlocked_content, [],),
      metadata: this.parseJsonField<Record<string, unknown>>(row.metadata, {},),
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update meta-progression after completing a playthrough
   */
  private async updateMetaProgression(
    playerId: string,
    endingId: string,
    _endingType: EndingType,
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.getMetaProgression(playerId,);

    const endingsSeen = existing.endingsSeen.includes(endingId,)
      ? existing.endingsSeen
      : [...existing.endingsSeen, endingId,];

    const metaProgressionData = {
      player_id: playerId,
      total_playthroughs: existing.totalPlaythroughs + 1,
      endings_seen: jsonStringifyOr(endingsSeen,),
      secrets_found: jsonStringifyOr(existing.secretsFound,),
      achievements_unlocked: jsonStringifyOr(existing.achievementsUnlocked,),
      permanent_bonuses: jsonStringifyOr(existing.permanentBonuses,),
      unlocked_content: jsonStringifyOr(existing.unlockedContent,),
      metadata: jsonStringifyOr(existing.metadata,),
      updated_at: now,
    };

    // Upsert meta-progression
    const existingRow = await (this.db as any)
      .selectFrom("meta_progression",)
      .where("player_id", "=", playerId,)
      .select("player_id",)
      .executeTakeFirst();

    if (existingRow) {
      await (this.db as any)
        .updateTable("meta_progression",)
        .set(metaProgressionData,)
        .where("player_id", "=", playerId,)
        .execute();
    } else {
      await (this.db as any)
        .insertInto("meta_progression",)
        .values(metaProgressionData,)
        .execute();
    }
  }

  /**
   * Get playthrough count for a player in a world
   */
  private async getPlaythroughCount(playerId: string, worldId: string,): Promise<number> {
    const result = await (this.db as any)
      .selectFrom("playthroughs",)
      .where("player_id", "=", playerId,)
      .where("world_id", "=", worldId,)
      .select((eb: any,) => eb.fn.count("id",).as("count",))
      .executeTakeFirst();

    return Number(result?.count ?? 0,);
  }

  /**
   * Parse JSON field safely
   */
  private parseJsonField<T,>(raw: unknown, fallback: T,): T {
    if (typeof raw !== "string") { return fallback; }
    return jsonParseOr(raw, fallback,);
  }

  /**
   * Convert database row to Playthrough interface
   */
  private rowToPlaythrough(row: any,): Playthrough {
    return {
      id: row.id,
      playerId: row.player_id,
      worldId: row.world_id,
      playthroughNumber: row.playthrough_number,
      difficulty: row.difficulty,
      isCompleted: row.is_completed,
      endingId: row.ending_id,
      endingType: row.ending_type,
      completionTime: row.completion_time,
      choicesMade: row.choices_made,
      secretsFound: row.secrets_found,
      achievementsUnlocked: row.achievements_unlocked,
      metadata: this.parseJsonField<Record<string, unknown>>(row.metadata, {},),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }
}
