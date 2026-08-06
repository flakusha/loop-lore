/**
 * NSFW Moderation Service
 *
 * Handles user NSFW preferences, content flags, and audit trail.
 */
import { type Kysely, } from "kysely";
import { type DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { jsonParseOr, jsonStringifyOr, } from "../utils/safe-json";

export interface NsfwUserPrefs {
  id: string;
  userId: string;
  nsfwEnabled: boolean;
  maxRating: string;
  blockedFromNsfw: boolean;
  bannedFromNsfw: boolean;
  shadowNsfw: boolean;
  blockReason: string | null;
  bannedAt: string | null;
  bannedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModAction {
  id: string;
  actionType: string;
  targetUserId: string;
  performedBy: string;
  reason: string;
  scope: string;
  scopeId: string | null;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
}

export interface ContentFlag {
  id: string;
  reporterId: string;
  contentType: string;
  contentId: string;
  chatId: string | null;
  worldId: string | null;
  flagReason: string;
  description: string | null;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export class NsfwModerationService {
  private readonly db: Kysely<DB>;
  private readonly log: Logger;

  constructor(database: Kysely<DB>,) {
    this.db = database;
    this.log = getLogger().child({ module: "nsfw-moderation", },);
  }

  async getPreferences(userId: string,): Promise<NsfwUserPrefs> {
    const row = await this.db
      .selectFrom("nsfw_user_preferences",)
      .where("user_id", "=", userId,)
      .selectAll()
      .executeTakeFirst();

    if (row) { return this.mapPrefs(row,); }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db
      .insertInto("nsfw_user_preferences",)
      .values({
        id,
        user_id: userId,
        nsfw_enabled: 1,
        max_rating: "nsfw_mild",
        blocked_from_nsfw: 0,
        banned_from_nsfw: 0,
        shadow_nsfw: 0,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return {
      id,
      userId,
      nsfwEnabled: true,
      maxRating: "nsfw_mild",
      blockedFromNsfw: false,
      bannedFromNsfw: false,
      shadowNsfw: false,
      blockReason: null,
      bannedAt: null,
      bannedBy: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updatePreferences(
    userId: string,
    updates: Partial<Pick<NsfwUserPrefs, "nsfwEnabled" | "maxRating">>,
  ): Promise<NsfwUserPrefs> {
    const now = new Date().toISOString();
    await this.getPreferences(userId,);
    const sets: Record<string, unknown> = { updated_at: now, };
    if (updates.nsfwEnabled !== undefined) { sets.nsfw_enabled = updates.nsfwEnabled ? 1 : 0; }
    if (updates.maxRating !== undefined) { sets.max_rating = updates.maxRating; }
    await this.db.updateTable("nsfw_user_preferences",).set(sets,).where("user_id", "=", userId,).execute();
    return this.getPreferences(userId,);
  }

  async blockUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction> {
    const now = new Date().toISOString();
    const prefs = await this.getPreferences(targetUserId,);
    if (prefs.bannedFromNsfw) { throw new Error("User is already banned from NSFW content.",); }
    await this.db.updateTable("nsfw_user_preferences",).set({
      blocked_from_nsfw: 1,
      block_reason: reason,
      updated_at: now,
    },).where("user_id", "=", targetUserId,).execute();
    this.log.info("NSFW block applied", { targetUserId, performedBy, reason, },);
    return this.recordAction({
      actionType: "block",
      targetUserId,
      performedBy,
      reason,
      scope: "nsfw",
      scopeId: null,
    },);
  }

  async unblockUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction> {
    const now = new Date().toISOString();
    await this.db.updateTable("nsfw_user_preferences",).set({
      blocked_from_nsfw: 0,
      block_reason: null,
      updated_at: now,
    },).where("user_id", "=", targetUserId,).execute();
    this.log.info("NSFW block removed", { targetUserId, performedBy, },);
    return this.recordAction({
      actionType: "unblock",
      targetUserId,
      performedBy,
      reason,
      scope: "nsfw",
      scopeId: null,
    },);
  }

  async banUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction> {
    const now = new Date().toISOString();
    await this.db.updateTable("nsfw_user_preferences",).set({
      banned_from_nsfw: 1,
      banned_at: now,
      banned_by: performedBy,
      blocked_from_nsfw: 1,
      block_reason: reason,
      updated_at: now,
    },).where("user_id", "=", targetUserId,).execute();
    this.log.warn("NSFW ban applied", { targetUserId, performedBy, reason, },);
    return this.recordAction({ actionType: "ban", targetUserId, performedBy, reason, scope: "nsfw", scopeId: null, },);
  }

  async unbanUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction> {
    const now = new Date().toISOString();
    await this.db.updateTable("nsfw_user_preferences",).set({
      banned_from_nsfw: 0,
      banned_at: null,
      banned_by: null,
      blocked_from_nsfw: 0,
      block_reason: null,
      updated_at: now,
    },).where("user_id", "=", targetUserId,).execute();
    this.log.info("NSFW ban removed", { targetUserId, performedBy, },);
    return this.recordAction({
      actionType: "unban",
      targetUserId,
      performedBy,
      reason,
      scope: "nsfw",
      scopeId: null,
    },);
  }

  async shadowUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction> {
    const now = new Date().toISOString();
    await this.db.updateTable("nsfw_user_preferences",).set({ shadow_nsfw: 1, updated_at: now, },).where(
      "user_id",
      "=",
      targetUserId,
    ).execute();
    this.log.info("NSFW shadow applied", { targetUserId, performedBy, },);
    return this.recordAction({
      actionType: "shadow",
      targetUserId,
      performedBy,
      reason,
      scope: "nsfw",
      scopeId: null,
    },);
  }

  async unshadowUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction> {
    const now = new Date().toISOString();
    await this.db.updateTable("nsfw_user_preferences",).set({ shadow_nsfw: 0, updated_at: now, },).where(
      "user_id",
      "=",
      targetUserId,
    ).execute();
    this.log.info("NSFW shadow removed", { targetUserId, performedBy, },);
    return this.recordAction({
      actionType: "unshadow",
      targetUserId,
      performedBy,
      reason,
      scope: "nsfw",
      scopeId: null,
    },);
  }

  async flagContent(
    params: {
      reporterId: string;
      contentType: string;
      contentId: string;
      chatId?: string;
      worldId?: string;
      flagReason: string;
      description?: string;
    },
  ): Promise<ContentFlag> {
    const existing = await this.db.selectFrom("content_flags",).selectAll().where(
      "content_type",
      "=",
      params.contentType,
    ).where(
      "content_id",
      "=",
      params.contentId,
    ).where("status", "in", ["pending", "under_review",],).executeTakeFirst();
    if (existing) { throw new Error("Content already flagged for review.",); }

    const dismissedCount = await this.db.selectFrom("content_flags",).where("reporter_id", "=", params.reporterId,)
      .where("status", "=", "dismissed",).select(({ fn, },) => fn.count<number>("id",).as("count",)).executeTakeFirst();
    if (dismissedCount && dismissedCount.count >= 3) {
      this.log.warn("Reporter has 3+ dismissed flags", { reporterId: params.reporterId, },);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.insertInto("content_flags",).values({
      id,
      reporter_id: params.reporterId,
      content_type: params.contentType,
      content_id: params.contentId,
      chat_id: params.chatId ?? null,
      world_id: params.worldId ?? null,
      flag_reason: params.flagReason,
      description: params.description ?? null,
      status: "pending",
      created_at: now,
    },).execute();

    this.log.info("Content flagged", { id, reporterId: params.reporterId, },);
    return {
      id,
      reporterId: params.reporterId,
      contentType: params.contentType,
      contentId: params.contentId,
      chatId: params.chatId ?? null,
      worldId: params.worldId ?? null,
      flagReason: params.flagReason,
      description: params.description ?? null,
      status: "pending",
      resolution: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
    };
  }

  async getFlagQueue(
    params?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ flags: ContentFlag[]; total: number }> {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const status = params?.status ?? "pending";
    const [rowsResult, countResult,] = await Promise.allSettled([
      this.db.selectFrom("content_flags",).where("status", "=", status,).orderBy("created_at", "desc",).limit(limit,)
        .offset(offset,).selectAll().execute(),
      this.db.selectFrom("content_flags",).where("status", "=", status,).select(({ fn, },) =>
        fn.count<number>("id",).as("count",)
      ).executeTakeFirst(),
    ],);
    const flagRows = rowsResult.status === "fulfilled" ? rowsResult.value : [];
    const countVal = countResult.status === "fulfilled" ? countResult.value : null;
    const flags = Array.from(flagRows, (r,) => this.mapFlag(r,),);
    return { flags, total: countVal?.count ?? 0, };
  }

  async resolveFlag(
    flagId: string,
    resolvedBy: string,
    resolution: string,
    status: "resolved" | "dismissed" | "confirmed",
  ): Promise<ContentFlag> {
    const now = new Date().toISOString();
    await this.db.updateTable("content_flags",).set({ status, resolution, resolved_by: resolvedBy, resolved_at: now, },)
      .where("id", "=", flagId,).execute();
    this.log.info("Content flag resolved", { flagId, resolvedBy, status, },);
    const row = await this.db.selectFrom("content_flags",).where("id", "=", flagId,).selectAll().executeTakeFirst();
    if (!row) { throw new Error(`Flag ${flagId} not found after resolution.`,); }
    return this.mapFlag(row,);
  }

  async getAuditLog(targetUserId: string, options?: { limit?: number; offset?: number },): Promise<ModAction[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const rows = await this.db.selectFrom("moderation_actions",).where("target_user_id", "=", targetUserId,).orderBy(
      "created_at",
      "desc",
    ).limit(limit,).offset(offset,).selectAll().execute();
    return Array.from(rows, (r,) => this.mapAction(r,),);
  }

  async exportUserData(
    userId: string,
  ): Promise<{ preferences: NsfwUserPrefs; actions: ModAction[]; flags: ContentFlag[] }> {
    const [preferences, actions,] = await Promise.allSettled([
      this.getPreferences(userId,),
      this.getAuditLog(userId,),
    ],);
    const flagRows = await this.db.selectFrom("content_flags",).where("reporter_id", "=", userId,).orderBy(
      "created_at",
      "desc",
    ).selectAll().execute();
    const flags = Array.from(flagRows, (r,) => this.mapFlag(r,),);
    return {
      preferences: preferences.status === "fulfilled" ? preferences.value : {} as NsfwUserPrefs,
      actions: actions.status === "fulfilled" ? actions.value : [],
      flags,
    };
  }

  async deleteUserData(userId: string,): Promise<void> {
    await this.db.deleteFrom("content_flags",).where("reporter_id", "=", userId,).execute();
    await this.db.deleteFrom("moderation_actions",).where("target_user_id", "=", userId,).execute();
    await this.db.deleteFrom("nsfw_user_preferences",).where("user_id", "=", userId,).execute();
    this.log.info("Moderation data deleted for user", { userId, },);
  }

  // ── Per-Chat/World NSFW Override ──────────────────────────

  /**
   * Get the effective NSFW setting for a chat, considering chat override,
   * world override, and user preference in that order.
   */
  async getEffectiveNsfw(chatId: string, userId: string,): Promise<{ enabled: boolean; source: string }> {
    // 0. Check if user is shadow-banned from NSFW (overrides everything)
    const prefs = await this.getPreferences(userId,);
    if (prefs.shadowNsfw) {
      return { enabled: false, source: "shadow_ban", };
    }

    // 1. Check chat-level override
    const chat = await this.db.selectFrom("chats",)
      .select(["nsfw_override", "world_id", "type",],)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    if (chat?.nsfw_override === "enabled") { return { enabled: true, source: "chat_override", }; }
    if (chat?.nsfw_override === "disabled") { return { enabled: false, source: "chat_override", }; }

    // 2. Check world-level override (if chat has a world)
    if (chat?.world_id) {
      const world = await this.db.selectFrom("worlds",)
        .select("nsfw_override",)
        .where("id", "=", chat.world_id,)
        .executeTakeFirst();
      if (world?.nsfw_override === "enabled") { return { enabled: true, source: "world_override", }; }
      if (world?.nsfw_override === "disabled") { return { enabled: false, source: "world_override", }; }
    }

    // 3. Fall back to user preference
    return { enabled: prefs.nsfwEnabled, source: "user_preference", };
  }

  /** Set NSFW override for a chat. Pass null to clear (revert to user pref). */
  async setChatNsfwOverride(chatId: string, override: "enabled" | "disabled" | null,): Promise<void> {
    await this.db.updateTable("chats",)
      .set({ nsfw_override: override, },)
      .where("id", "=", chatId,)
      .execute();
    this.log.info("Chat NSFW override updated", { chatId, override, },);
  }

  /** Set NSFW override for a world. Pass null to clear (revert to user pref). */
  async setWorldNsfwOverride(worldId: string, override: "enabled" | "disabled" | null,): Promise<void> {
    await this.db.updateTable("worlds",)
      .set({ nsfw_override: override, },)
      .where("id", "=", worldId,)
      .execute();
    this.log.info("World NSFW override updated", { worldId, override, },);
  }

  async recordAction(
    params: {
      actionType: string;
      targetUserId: string;
      performedBy: string;
      reason: string;
      scope: string;
      scopeId: string | null;
    },
  ): Promise<ModAction> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.insertInto("moderation_actions",).values({
      id,
      action_type: params.actionType,
      target_user_id: params.targetUserId,
      performed_by: params.performedBy,
      reason: params.reason,
      scope: params.scope,
      scope_id: params.scopeId,
      metadata: "{}",
      created_at: now,
    },).execute();

    // Notify the target user of the action (skip for system actions)
    if (params.performedBy !== "system") {
      await this.notifyUser(params.targetUserId, params.actionType, params.reason,).catch(
        (err: unknown,) => this.log.warn("Failed to send moderation notification", { error: String(err,), },),
      );
    }

    return {
      id,
      actionType: params.actionType,
      targetUserId: params.targetUserId,
      performedBy: params.performedBy,
      reason: params.reason,
      scope: params.scope,
      scopeId: params.scopeId,
      metadata: {},
      expiresAt: null,
      createdAt: now,
    };
  }

  // ── Appeals ────────────────────────────────────────────────

  /** Submit an appeal for a moderation action. */
  async submitAppeal(userId: string, actionId: string, reason: string,): Promise<{ id: string; status: string }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.insertInto("moderation_appeals" as any,).values({
      id,
      user_id: userId,
      action_id: actionId,
      reason,
      status: "pending",
      created_at: now,
    },).execute();
    this.log.info("Appeal submitted", { userId, actionId, },);
    return { id, status: "pending", };
  }

  /** Get appeals for a user. */
  async getUserAppeals(
    userId: string,
  ): Promise<
    Array<
      {
        id: string;
        actionId: string;
        reason: string;
        status: string;
        reviewedBy: string | null;
        reviewNote: string | null;
        createdAt: string;
      }
    >
  > {
    const rows = await this.db.selectFrom("moderation_appeals" as any,).selectAll()
      .where("user_id", "=", userId,)
      .orderBy("created_at", "desc",)
      .execute() as Array<
        {
          id: string;
          user_id: string;
          action_id: string;
          reason: string;
          status: string;
          reviewed_by: string | null;
          review_note: string | null;
          created_at: string;
        }
      >;
    return rows.map((r,) => ({
      id: r.id,
      actionId: r.action_id,
      reason: r.reason,
      status: r.status,
      reviewedBy: r.reviewed_by,
      reviewNote: r.review_note,
      createdAt: r.created_at,
    }));
  }

  /** Get pending appeals (admin). */
  async getPendingAppeals(
    limit = 50,
  ): Promise<Array<{ id: string; userId: string; actionId: string; reason: string; createdAt: string }>> {
    const rows = await this.db.selectFrom("moderation_appeals" as any,).selectAll()
      .where("status", "=", "pending",)
      .orderBy("created_at", "asc",)
      .limit(limit,)
      .execute() as Array<{ id: string; user_id: string; action_id: string; reason: string; created_at: string }>;
    return rows.map((r,) => ({
      id: r.id,
      userId: r.user_id,
      actionId: r.action_id,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }

  /** Review an appeal (approve or deny). */
  async reviewAppeal(
    appealId: string,
    reviewedBy: string,
    status: "approved" | "denied",
    reviewNote: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db.updateTable("moderation_appeals" as any,)
      .set({ status, reviewed_by: reviewedBy, review_note: reviewNote, updated_at: now, },)
      .where("id", "=", appealId,)
      .execute();

    // If approved, reverse the original action
    if (status === "approved") {
      const appeal = await this.db.selectFrom("moderation_appeals" as any,)
        .select("action_id",)
        .where("id", "=", appealId,)
        .executeTakeFirst() as { action_id: string } | undefined;
      if (appeal) {
        const action = await this.db.selectFrom("moderation_actions",)
          .select(["action_type", "target_user_id",],)
          .where("id", "=", appeal.action_id,)
          .executeTakeFirst();
        if (action) {
          const reverseMap: Record<string, () => Promise<ModAction>> = {
            block: () => this.unblockUser(action.target_user_id, reviewedBy, "Appeal approved",),
            ban: () => this.unbanUser(action.target_user_id, reviewedBy, "Appeal approved",),
            shadow: () => this.unshadowUser(action.target_user_id, reviewedBy, "Appeal approved",),
          };
          const reverser = reverseMap[action.action_type];
          if (reverser) { await reverser(); }
        }
      }
    }

    this.log.info("Appeal reviewed", { appealId, status, reviewedBy, },);
  }

  private async notifyUser(userId: string, actionType: string, reason: string,): Promise<void> {
    const titles: Record<string, string> = {
      block: "You have been blocked from NSFW content",
      unblock: "Your NSFW access has been restored",
      ban: "You have been banned from NSFW content",
      unban: "Your NSFW ban has been lifted",
      shadow: "Your NSFW access has been restricted",
      unshadow: "Your NSFW access restrictions have been lifted",
    };
    const title = titles[actionType] ?? `Moderation action: ${actionType}`;
    await this.db.insertInto("notifications",).values({
      id: crypto.randomUUID(),
      user_id: userId,
      type: "moderation",
      title,
      body: reason,
      link: null,
      data: jsonStringifyOr({ actionType, },),
      created_at: new Date().toISOString(),
    },).execute();
  }

  private mapPrefs(
    row: {
      id: string;
      user_id: string;
      nsfw_enabled: number;
      max_rating: string;
      blocked_from_nsfw: number;
      banned_from_nsfw: number;
      shadow_nsfw: number;
      block_reason: string | null;
      banned_at: string | null;
      banned_by: string | null;
      created_at: string;
      updated_at: string;
    },
  ): NsfwUserPrefs {
    return {
      id: row.id,
      userId: row.user_id,
      nsfwEnabled: row.nsfw_enabled === 1,
      maxRating: row.max_rating,
      blockedFromNsfw: row.blocked_from_nsfw === 1,
      bannedFromNsfw: row.banned_from_nsfw === 1,
      shadowNsfw: row.shadow_nsfw === 1,
      blockReason: row.block_reason,
      bannedAt: row.banned_at,
      bannedBy: row.banned_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAction(
    row: {
      id: string;
      action_type: string;
      target_user_id: string;
      performed_by: string;
      reason: string;
      scope: string;
      scope_id: string | null;
      metadata: string;
      expires_at: string | null;
      created_at: string;
    },
  ): ModAction {
    return {
      id: row.id,
      actionType: row.action_type,
      targetUserId: row.target_user_id,
      performedBy: row.performed_by,
      reason: row.reason,
      scope: row.scope,
      scopeId: row.scope_id,
      metadata: jsonParseOr<Record<string, unknown>>(row.metadata, {},),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  private mapFlag(
    row: {
      id: string;
      reporter_id: string;
      content_type: string;
      content_id: string;
      chat_id: string | null;
      world_id: string | null;
      flag_reason: string;
      description: string | null;
      status: string;
      resolution: string | null;
      resolved_by: string | null;
      resolved_at: string | null;
      created_at: string;
    },
  ): ContentFlag {
    return {
      id: row.id,
      reporterId: row.reporter_id,
      contentType: row.content_type,
      contentId: row.content_id,
      chatId: row.chat_id,
      worldId: row.world_id,
      flagReason: row.flag_reason,
      description: row.description,
      status: row.status,
      resolution: row.resolution,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
    };
  }
}
