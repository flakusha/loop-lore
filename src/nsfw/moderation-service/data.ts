// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — user data
 *
 * Exporting and deleting a user's moderation-related data (GDPR support).
 */
import { jsonStringifyOr, } from "../../utils/safe-json";
import { mapFlag, } from "./flags";
import type { ContentFlag, ModAction, NsfwModerationServiceContext, NsfwUserPrefs, } from "./types";

export interface ExportUserDataArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
}

/** Export all moderation data for a user (prefs, actions, flags). */
export async function exportUserData(
  { thisL, userId, }: ExportUserDataArgs,
): Promise<{ preferences: NsfwUserPrefs | null; actions: ModAction[]; flags: ContentFlag[] }> {
  const [preferences, actions,] = await Promise.allSettled([
    thisL.getPreferences(userId,),
    thisL.getAuditLog(userId,),
  ],);
  const flagRows = await thisL.db.selectFrom("content_flags",).where("reporter_id", "=", userId,).orderBy(
    "created_at",
    "desc",
  ).selectAll().execute();
  const flags = Array.from(flagRows, (r,) => mapFlag(r,),);
  return {
    preferences: preferences.status === "fulfilled" ? preferences.value : null as NsfwUserPrefs | null,
    actions: actions.status === "fulfilled" ? actions.value : [],
    flags,
  };
}

export interface DeleteUserDataArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
  /** Admin userId performing the deletion; recorded in moderation_actions.deleted_by and log_entries.user_id for accountability. */
  deletedBy: string;
}

/** Delete all moderation data for a user, preserving the audit log. */
export async function deleteUserData(
  { thisL, userId, deletedBy, }: DeleteUserDataArgs,
): Promise<void> {
  const now = new Date().toISOString();
  // Soft-delete moderation_actions: preserves the audit log for forensics
  // and regulatory retention. GDPR subjects the user-owned `nsfw_user_preferences`
  // row to erasure; `moderation_actions` is an org-level security record.
  await thisL.db.updateTable("moderation_actions",)
    .set({ deleted_at: now, deleted_by: deletedBy, },)
    .where("target_user_id", "=", userId,)
    .where("deleted_at", "is", null,)
    .execute();
  // Hard-delete user-owned rows: NSFW preferences + reporter's own flags.
  await thisL.db.deleteFrom("content_flags",).where("reporter_id", "=", userId,).execute();
  await thisL.db.deleteFrom("nsfw_user_preferences",).where("user_id", "=", userId,).execute();
  // Audit trail of the destructive operation itself.
  await thisL.db.insertInto("log_entries",).values({
    id: crypto.randomUUID(),
    level: 30,
    timestamp: Date.now() / 1000,
    time: now,
    message: "NSFW moderation user-data deletion (audit-preserving)",
    module: "nsfw-moderation",
    user_id: deletedBy,
    session_id: null,
    request_id: null,
    meta: jsonStringifyOr({
      tablesAffected: ["moderation_actions", "content_flags", "nsfw_user_preferences",],
      targetUserId: userId,
      deletedBy,
    },),
    event_type: "moderation",
    entity_type: "user",
    entity_id: userId,
    action: "delete-user-data",
    created_at: now,
  },).execute();
  thisL.log.warn("Moderation data deleted (audit preserved) for user", { userId, deletedBy, },);
}
