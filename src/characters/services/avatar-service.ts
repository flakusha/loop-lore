/**
 * Character Avatar Service
 *
 * Manages one-to-many avatars with context/mood/action tags
 * and configurable selection rules.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { AvatarSelectionRule, AvatarTagType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";

/** Options for creating an avatar */
export interface CreateAvatarOpts {
  actorId: string;
  assetId: string;
  label: string;
  tags?: Partial<Record<AvatarTagType, string>>;
  isPrimary?: boolean;
  sortOrder?: number;
}

/** Options for updating an avatar */
export interface UpdateAvatarOpts {
  label?: string;
  tags?: Partial<Record<AvatarTagType, string>>;
  isPrimary?: boolean;
  sortOrder?: number;
}

/** Avatar with parsed tags */
export interface Avatar {
  id: string;
  actorId: string;
  assetId: string;
  label: string;
  tags: Partial<Record<AvatarTagType, string>>;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Avatar selection config */
export interface AvatarConfig {
  id: string;
  actorId: string;
  selectionRule: AvatarSelectionRule;
  weights: Record<AvatarTagType, number>;
  fallbackChain: AvatarTagType[];
  createdAt: string;
  updatedAt: string;
}

/** Context for avatar selection */
export interface AvatarSelectionContext {
  emotion?: string;
  mood?: string;
  action?: string;
  location?: string;
  time?: string;
  outfit?: string;
}

/** All tag types for iteration */
const ALL_TAG_TYPES: AvatarTagType[] = ["emotion", "mood", "action", "location", "time", "outfit",];

/**
 * Character Avatar Service
 *
 * Manages multiple avatars per character with context-aware selection.
 * Avatars are tagged with emotion, mood, action, location, time, and outfit.
 */
export class AvatarService {
  constructor(private readonly db: Kysely<DB>,) {}

  // ── Avatar CRUD ─────────────────────────────────────────

  /**
   * Get all avatars for a character
   * @param actorId - Character actor ID
   * @returns List of avatars sorted by sort_order
   */
  async getAvatars(actorId: string,): Promise<Avatar[]> {
    const rows = await this.db
      .selectFrom("character_avatars",)
      .where("actor_id", "=", actorId,)
      .orderBy("sort_order", "asc",)
      .selectAll()
      .execute();

    return rows.map((row,) => this.rowToAvatar(row,));
  }

  /**
   * Get a specific avatar by ID
   * @param avatarId - Avatar ID
   * @returns Avatar or undefined
   */
  async getAvatar(avatarId: string,): Promise<Avatar | undefined> {
    const row = await this.db
      .selectFrom("character_avatars",)
      .where("id", "=", avatarId,)
      .selectAll()
      .executeTakeFirst();

    return row ? this.rowToAvatar(row,) : undefined;
  }

  /**
   * Create a new avatar
   * @param opts - Avatar creation options
   * @returns Created avatar ID
   */
  async createAvatar(opts: CreateAvatarOpts,): Promise<string> {
    const id = randomUUID();
    const now = new Date().toISOString();

    // If setting as primary, unset other primaries
    if (opts.isPrimary) {
      await this.db
        .updateTable("character_avatars",)
        .set({ is_primary: 0, },)
        .where("actor_id", "=", opts.actorId,)
        .execute();
    }

    await this.db
      .insertInto("character_avatars",)
      .values({
        id,
        actor_id: opts.actorId,
        asset_id: opts.assetId,
        label: opts.label,
        tags: JSON.stringify(opts.tags ?? {},),
        is_primary: opts.isPrimary ? 1 : 0,
        sort_order: opts.sortOrder ?? 0,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return id;
  }

  /**
   * Update an avatar
   * @param avatarId - Avatar ID
   * @param opts - Update options
   */
  async updateAvatar(avatarId: string, opts: UpdateAvatarOpts,): Promise<void> {
    const existing = await this.getAvatar(avatarId,);
    if (!existing) {
      throw new Error(`Avatar ${avatarId} not found`,);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updated_at: now,
    };

    if (opts.label !== undefined) {
      updateData.label = opts.label;
    }
    if (opts.tags !== undefined) {
      updateData.tags = JSON.stringify(opts.tags,);
    }
    if (opts.isPrimary !== undefined) {
      if (opts.isPrimary) {
        // Unset other primaries
        await this.db
          .updateTable("character_avatars",)
          .set({ is_primary: 0, },)
          .where("actor_id", "=", existing.actorId,)
          .execute();
      }
      updateData.is_primary = opts.isPrimary ? 1 : 0;
    }
    if (opts.sortOrder !== undefined) {
      updateData.sort_order = opts.sortOrder;
    }

    await this.db
      .updateTable("character_avatars",)
      .set(updateData,)
      .where("id", "=", avatarId,)
      .execute();
  }

  /**
   * Delete an avatar
   * @param avatarId - Avatar ID
   */
  async deleteAvatar(avatarId: string,): Promise<void> {
    await this.db
      .deleteFrom("character_avatars",)
      .where("id", "=", avatarId,)
      .execute();
  }

  // ── Avatar Selection ────────────────────────────────────

  /**
   * Select the best avatar based on context
   * @param actorId - Character actor ID
   * @param context - Selection context (emotion, mood, action, etc.)
   * @param worldId - Optional world ID for world-specific config
   * @returns Best matching avatar or primary avatar as fallback
   */
  async selectAvatar(
    actorId: string,
    context: AvatarSelectionContext,
    worldId?: string,
  ): Promise<Avatar> {
    const avatars = await this.getAvatars(actorId,);
    if (avatars.length === 0) {
      throw new Error(`No avatars found for actor ${actorId}`,);
    }

    // Get config (world-specific or default)
    const worldConfig = worldId
      ? await this.getWorldAvatarConfig(actorId, worldId,)
      : undefined;
    const defaultConfig = await this.getAvatarConfig(actorId,);

    // Merge world-specific overrides with default config
    const selectionRule = worldConfig?.selectionRuleOverride ?? defaultConfig?.selectionRule ?? "emotion_first";
    const weights = worldConfig?.weightsOverride
      ? { ...defaultConfig?.weights, ...worldConfig.weightsOverride, }
      : defaultConfig?.weights ?? {
        emotion: 0.4,
        mood: 0.3,
        action: 0.2,
        location: 0.1,
        time: 0.05,
        outfit: 0.05,
      };

    // Apply selection rule
    const rule = selectionRule;

    let bestAvatar: Avatar | undefined = avatars[0];
    let bestScore = -1;

    for (const avatar of avatars) {
      const score = this.calculateAvatarScore(avatar, context, weights, rule,);
      if (score > bestScore) {
        bestScore = score;
        bestAvatar = avatar;
      }
    }

    if (!bestAvatar) {
      throw new Error(`No avatars found for actor ${actorId}`,);
    }

    return bestAvatar;
  }

  /**
   * Calculate score for an avatar based on context and weights.
   * Iterates over all tag types, comparing context values to avatar tags.
   * @param avatar - Avatar to score
   * @param context - Selection context
   * @param weights - Tag type weights
   * @param rule - Selection rule
   * @returns Score (higher is better)
   */
  private calculateAvatarScore(
    avatar: Avatar,
    context: AvatarSelectionContext,
    weights: Record<AvatarTagType, number>,
    rule: AvatarSelectionRule,
  ): number {
    let score = 0;

    // Score each tag type
    for (const tag of ALL_TAG_TYPES) {
      const contextValue = context[tag];
      const avatarValue = avatar.tags[tag];
      if (contextValue && avatarValue) {
        const match = avatarValue.toLowerCase() === contextValue.toLowerCase();
        score += match ? weights[tag] * 100 : 0;
      }
    }

    // Apply rule modifiers
    if (
      (rule === "emotion_first" && context.emotion && avatar.tags.emotion) ||
      (rule === "mood_first" && context.mood && avatar.tags.mood)
    ) {
      score *= 1.5;
    }

    // Bonus for primary avatar (tiebreaker)
    if (avatar.isPrimary) {
      score += 0.1;
    }

    return score;
  }

  // ── Avatar Config ───────────────────────────────────────

  /**
   * Get avatar config for a character
   * @param actorId - Character actor ID
   * @returns Avatar config or undefined
   */
  async getAvatarConfig(actorId: string,): Promise<AvatarConfig | undefined> {
    const row = await this.db
      .selectFrom("character_avatar_config",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirst();

    if (!row) { return undefined; }

    return {
      id: row.id,
      actorId: row.actor_id,
      selectionRule: row.selection_rule,
      weights: jsonParseOr<Record<AvatarTagType, number>>(row.weights, {} as Record<AvatarTagType, number>,),
      fallbackChain: jsonParseOr<AvatarTagType[]>(row.fallback_chain, [] as AvatarTagType[],),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Create or update avatar config
   * @param actorId - Character actor ID
   * @param config - Config options
   */
  async upsertAvatarConfig(
    actorId: string,
    config: {
      selectionRule?: AvatarSelectionRule;
      weights?: Partial<Record<AvatarTagType, number>>;
      fallbackChain?: AvatarTagType[];
    },
  ): Promise<string> {
    const now = new Date().toISOString();

    // Get raw database row
    const existingRow = await this.db
      .selectFrom("character_avatar_config",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirst();

    if (existingRow) {
      const existingWeights = jsonParseOr<Record<AvatarTagType, number>>(
        existingRow.weights,
        {} as Record<AvatarTagType, number>,
      );
      const mergedWeights = config.weights
        ? { ...existingWeights, ...config.weights, }
        : existingWeights;
      const fallbackChain = config.fallbackChain
        ? jsonStringifyOr(config.fallbackChain,)
        : existingRow.fallback_chain;

      await this.db
        .updateTable("character_avatar_config",)
        .set({
          selection_rule: config.selectionRule ?? existingRow.selection_rule,
          weights: JSON.stringify(mergedWeights,),
          fallback_chain: fallbackChain,
          updated_at: now,
        },)
        .where("actor_id", "=", actorId,)
        .execute();

      return existingRow.id;
    }

    const id = randomUUID();
    const defaultWeights = {
      emotion: 0.4,
      mood: 0.3,
      action: 0.2,
      location: 0.1,
      time: 0.05,
      outfit: 0.05,
    };

    await this.db
      .insertInto("character_avatar_config",)
      .values({
        id,
        actor_id: actorId,
        selection_rule: config.selectionRule ?? "emotion_first",
        weights: JSON.stringify(config.weights ?? defaultWeights,),
        fallback_chain: JSON.stringify(config.fallbackChain ?? [],),
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return id;
  }

  // ── World Avatar Config ─────────────────────────────────

  /**
   * Get world-specific avatar config
   * @param actorId - Character actor ID
   * @param worldId - World ID
   * @returns World avatar config or undefined
   */
  async getWorldAvatarConfig(actorId: string, worldId: string,) {
    const row = await this.db
      .selectFrom("world_avatar_config",)
      .where("actor_id", "=", actorId,)
      .where("world_id", "=", worldId,)
      .selectAll()
      .executeTakeFirst();

    if (!row) { return; }

    return {
      id: row.id,
      worldId: row.world_id,
      actorId: row.actor_id,
      selectionRuleOverride: row.selection_rule_override as AvatarSelectionRule | undefined,
      weightsOverride: row.weights_override
        ? jsonParseOr<Record<AvatarTagType, number>>(row.weights_override, {} as Record<AvatarTagType, number>,)
        : undefined,
    };
  }

  /**
   * Create or update world-specific avatar config
   * @param actorId - Character actor ID
   * @param worldId - World ID
   * @param config - Config overrides
   */
  async upsertWorldAvatarConfig(
    actorId: string,
    worldId: string,
    config: {
      selectionRuleOverride?: AvatarSelectionRule;
      weightsOverride?: Partial<Record<AvatarTagType, number>>;
    },
  ): Promise<string> {
    const existing = await this.getWorldAvatarConfig(actorId, worldId,);
    const now = new Date().toISOString();

    if (existing) {
      await this.db
        .updateTable("world_avatar_config",)
        .set({
          selection_rule_override: config.selectionRuleOverride ?? existing.selectionRuleOverride ?? null,
          weights_override: config.weightsOverride
            ? JSON.stringify(config.weightsOverride,)
            : (existing.weightsOverride
              ? JSON.stringify(existing.weightsOverride,)
              : null),
          updated_at: now,
        },)
        .where("actor_id", "=", actorId,)
        .where("world_id", "=", worldId,)
        .execute();

      return existing.id;
    }

    const id = randomUUID();
    await this.db
      .insertInto("world_avatar_config",)
      .values({
        id,
        world_id: worldId,
        actor_id: actorId,
        selection_rule_override: config.selectionRuleOverride ?? null,
        weights_override: config.weightsOverride
          ? JSON.stringify(config.weightsOverride,)
          : null,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return id;
  }

  // ── Helpers ─────────────────────────────────────────────

  /**
   * Convert database row to Avatar object
   * @param row - Database row
   * @returns Avatar object
   */
  private rowToAvatar(row: {
    id: string;
    actor_id: string;
    asset_id: string;
    label: string;
    tags: string;
    is_primary: number;
    sort_order: number;
    created_at: string;
    updated_at: string;
  },): Avatar {
    return {
      id: row.id,
      actorId: row.actor_id,
      assetId: row.asset_id,
      label: row.label,
      tags: jsonParseOr(row.tags, {},),
      isPrimary: row.is_primary === 1,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
