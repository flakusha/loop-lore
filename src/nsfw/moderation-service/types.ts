// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — types
 *
 * Shared domain types (user prefs, moderation actions, content flags) plus the
 * public API interface (single source of truth) and the full context handed to
 * thisL dispatchers.
 */
import { type Kysely, } from "kysely";
import { type NsfwAccessStatus, } from "../../db/enums";
import { type DB, } from "../../db/schema";
import { type Logger, } from "../../logger";

/** Per-user NSFW preferences row (camel-cased projection). */
export interface NsfwUserPrefs {
  id: string;
  userId: string;
  nsfwEnabled: boolean;
  maxRating: string;
  accessStatus: NsfwAccessStatus;
  shadowNsfw: boolean;
  blockReason: string | null;
  bannedAt: string | null;
  bannedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A single recorded moderation action (block/ban/shadow/…). */
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
  /** Set when soft-deleted via deleteUserData; null for live actions. */
  deletedAt: string | null;
  /** Admin userId who performed the soft-delete; null for live actions. */
  deletedBy: string | null;
}

/** A user-submitted content flag awaiting/pending review. */
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

/** The database + logger a moderation dispatcher reaches via `thisL`. */
export interface ModerationDeps {
  db: Kysely<DB>;
  log: Logger;
}

/**
 * NSFW Moderation Service — public API (single source of truth).
 *
 * Declaration-merged with the {@link NsfwModerationService} value (a class)
 * in `index.ts`, so one exported name is both the instance type and the
 * constructor used as `new NsfwModerationService(db)`. Do not hand-roll a
 * parallel interface alongside it.
 */
export interface NsfwModerationService {
  getPreferences(userId: string,): Promise<NsfwUserPrefs | null>;
  getOrCreateOwn(userId: string,): Promise<NsfwUserPrefs>;
  updatePreferences(
    userId: string,
    updates: Partial<Pick<NsfwUserPrefs, "nsfwEnabled" | "maxRating">>,
  ): Promise<NsfwUserPrefs>;
  blockUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction>;
  unblockUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction>;
  banUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction>;
  unbanUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction>;
  shadowUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction>;
  unshadowUser(targetUserId: string, performedBy: string, reason: string,): Promise<ModAction>;
  flagContent(params: {
    reporterId: string;
    contentType: string;
    contentId: string;
    chatId?: string;
    worldId?: string;
    flagReason: string;
    description?: string;
  },): Promise<ContentFlag>;
  getFlagQueue(
    params?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ flags: ContentFlag[]; total: number }>;
  getAuditLog(targetUserId: string, options?: { limit?: number; offset?: number },): Promise<ModAction[]>;
  resolveFlag(
    flagId: string,
    resolvedBy: string,
    resolution: string,
    status: "resolved" | "dismissed" | "confirmed",
  ): Promise<ContentFlag>;
  exportUserData(
    userId: string,
    exportedBy: string,
    clientIp?: string | null,
  ): Promise<{ preferences: NsfwUserPrefs | null; actions: ModAction[]; flags: ContentFlag[] }>;
  deleteUserData(userId: string, deletedBy: string,): Promise<void>;
  getEffectiveNsfw(chatId: string, userId: string,): Promise<{ enabled: boolean; source: string }>;
  setChatNsfwOverride(chatId: string, override: "enabled" | "disabled" | null, performedBy: string,): Promise<void>;
  setWorldNsfwOverride(worldId: string, override: "enabled" | "disabled" | null, performedBy: string,): Promise<void>;
  recordAction(params: {
    actionType: string;
    targetUserId: string;
    performedBy: string;
    reason: string;
    scope: string;
    scopeId: string | null;
  },): Promise<ModAction>;
  submitAppeal(userId: string, actionId: string, reason: string,): Promise<{ id: string; status: string }>;
  getUserAppeals(userId: string,): Promise<
    Array<{
      id: string;
      actionId: string;
      reason: string;
      status: string;
      reviewedBy: string | null;
      reviewNote: string | null;
      createdAt: string;
    }>
  >;
  getPendingAppeals(
    limit?: number,
  ): Promise<Array<{ id: string; userId: string; actionId: string; reason: string; createdAt: string }>>;
  reviewAppeal(appealId: string, reviewedBy: string, status: "approved" | "denied", reviewNote: string,): Promise<void>;
  executeReversal(appealId: string, executedBy: string, approvedBy: string,): Promise<ModAction>;
}

/**
 * The full service context handed to dispatchers as `thisL`: the public API
 * plus the database and logger, so any dispatcher can reach sibling methods
 * and storage.
 */
export type NsfwModerationServiceContext = NsfwModerationService & ModerationDeps;
