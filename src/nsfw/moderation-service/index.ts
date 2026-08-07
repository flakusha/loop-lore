/**
 * NSFW Moderation Service — barrel
 *
 * Splits the former `src/nsfw/moderation-service.ts` class into thisL
 * dispatchers grouped by subdomain (preferences / audit / mod-actions /
 * flags / overrides / data / appeals), reassembled here into the exported
 * `NsfwModerationService`.
 *
 * `NsfwModerationService` is a single source of truth: the interface (in
 * `types.ts`) IS the API type and the class value shares the same exported
 * name (TS declaration merge), so there is no parallel interface to keep in
 * sync. Callers construct it via `new NsfwModerationService(db)` — preserved
 * from the original class so every existing call site keeps working unchanged.
 */
import { type Kysely, } from "kysely";
import { type DB, } from "../../db/schema";
import { getLogger, type Logger, } from "../../logger";
import { getPendingAppeals, getUserAppeals, reviewAppeal, submitAppeal, } from "./appeals";
import { getAuditLog, recordAction, } from "./audit";
import { deleteUserData, exportUserData, } from "./data";
import { flagContent, getFlagQueue, resolveFlag, } from "./flags";
import { banUser, blockUser, shadowUser, unbanUser, unblockUser, unshadowUser, } from "./mod-actions";
import { getEffectiveNsfw, setChatNsfwOverride, setWorldNsfwOverride, } from "./overrides";
import { getPreferences, updatePreferences, } from "./preferences";
import type {
  NsfwModerationService as NsfwModerationServiceIface,
  NsfwModerationServiceContext,
} from "./types";

export type {
  ContentFlag,
  ModAction,
  NsfwUserPrefs,
} from "./types";

/**
 * Public API type — declaration-merged with the class value below so one name
 * is both the instance type and the `new`-able constructor.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface NsfwModerationService extends NsfwModerationServiceIface {}

/**
 * NSFW Moderation Service.
 *
 * Each public method delegates to a thisL dispatcher (`{ thisL, ...args }`);
 * dispatchers reach sibling methods and storage through `thisL`.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class NsfwModerationService implements NsfwModerationServiceIface {
  readonly db: Kysely<DB>;
  readonly log: Logger;

  constructor(database: Kysely<DB>,) {
    this.db = database;
    this.log = getLogger().child({ module: "nsfw-moderation", },);
  }

  getPreferences = (userId: string,) =>
    getPreferences({ thisL: this as unknown as NsfwModerationServiceContext, userId, },);
  updatePreferences = (userId: string, updates: Parameters<NsfwModerationServiceIface["updatePreferences"]>[1],) =>
    updatePreferences({ thisL: this as unknown as NsfwModerationServiceContext, userId, updates, },);
  blockUser = (targetUserId: string, performedBy: string, reason: string,) =>
    blockUser({ thisL: this as unknown as NsfwModerationServiceContext, targetUserId, performedBy, reason, },);
  unblockUser = (targetUserId: string, performedBy: string, reason: string,) =>
    unblockUser({ thisL: this as unknown as NsfwModerationServiceContext, targetUserId, performedBy, reason, },);
  banUser = (targetUserId: string, performedBy: string, reason: string,) =>
    banUser({ thisL: this as unknown as NsfwModerationServiceContext, targetUserId, performedBy, reason, },);
  unbanUser = (targetUserId: string, performedBy: string, reason: string,) =>
    unbanUser({ thisL: this as unknown as NsfwModerationServiceContext, targetUserId, performedBy, reason, },);
  shadowUser = (targetUserId: string, performedBy: string, reason: string,) =>
    shadowUser({ thisL: this as unknown as NsfwModerationServiceContext, targetUserId, performedBy, reason, },);
  unshadowUser = (targetUserId: string, performedBy: string, reason: string,) =>
    unshadowUser({ thisL: this as unknown as NsfwModerationServiceContext, targetUserId, performedBy, reason, },);
  flagContent = (params: Parameters<NsfwModerationServiceIface["flagContent"]>[0],) =>
    flagContent({ thisL: this as unknown as NsfwModerationServiceContext, params, },);
  getFlagQueue = (params?: Parameters<NsfwModerationServiceIface["getFlagQueue"]>[0],) =>
    getFlagQueue({ thisL: this as unknown as NsfwModerationServiceContext, params, },);
  resolveFlag = (
    flagId: string,
    resolvedBy: string,
    resolution: string,
    status: Parameters<NsfwModerationServiceIface["resolveFlag"]>[3],
  ) =>
    resolveFlag({ thisL: this as unknown as NsfwModerationServiceContext, flagId, resolvedBy, resolution, status, },);
  getAuditLog = (targetUserId: string, options?: Parameters<NsfwModerationServiceIface["getAuditLog"]>[1],) =>
    getAuditLog({ thisL: this as unknown as NsfwModerationServiceContext, targetUserId, options, },);
  exportUserData = (userId: string,) =>
    exportUserData({ thisL: this as unknown as NsfwModerationServiceContext, userId, },);
  deleteUserData = (userId: string,) =>
    deleteUserData({ thisL: this as unknown as NsfwModerationServiceContext, userId, },);
  getEffectiveNsfw = (chatId: string, userId: string,) =>
    getEffectiveNsfw({ thisL: this as unknown as NsfwModerationServiceContext, chatId, userId, },);
  setChatNsfwOverride = (chatId: string, override: Parameters<NsfwModerationServiceIface["setChatNsfwOverride"]>[1],) =>
    setChatNsfwOverride({ thisL: this as unknown as NsfwModerationServiceContext, chatId, override, },);
  setWorldNsfwOverride = (
    worldId: string,
    override: Parameters<NsfwModerationServiceIface["setWorldNsfwOverride"]>[1],
  ) => setWorldNsfwOverride({ thisL: this as unknown as NsfwModerationServiceContext, worldId, override, },);
  recordAction = (params: Parameters<NsfwModerationServiceIface["recordAction"]>[0],) =>
    recordAction({ thisL: this as unknown as NsfwModerationServiceContext, params, },);
  submitAppeal = (userId: string, actionId: string, reason: string,) =>
    submitAppeal({ thisL: this as unknown as NsfwModerationServiceContext, userId, actionId, reason, },);
  getUserAppeals = (userId: string,) =>
    getUserAppeals({ thisL: this as unknown as NsfwModerationServiceContext, userId, },);
  getPendingAppeals = (limit?: number,) =>
    getPendingAppeals({ thisL: this as unknown as NsfwModerationServiceContext, limit, },);
  reviewAppeal = (
    appealId: string,
    reviewedBy: string,
    status: Parameters<NsfwModerationServiceIface["reviewAppeal"]>[2],
    reviewNote: string,
  ) =>
    reviewAppeal({
      thisL: this as unknown as NsfwModerationServiceContext,
      appealId,
      reviewedBy,
      status,
      reviewNote,
    },);
}
