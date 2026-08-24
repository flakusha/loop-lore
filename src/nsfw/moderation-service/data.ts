// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — user data
 *
 * Exporting and deleting a user's moderation-related data (GDPR support).
 */
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
}

/** Delete all moderation data for a user. */
export async function deleteUserData({ thisL, userId, }: DeleteUserDataArgs,): Promise<void> {
  await thisL.db.deleteFrom("content_flags",).where("reporter_id", "=", userId,).execute();
  await thisL.db.deleteFrom("moderation_actions",).where("target_user_id", "=", userId,).execute();
  await thisL.db.deleteFrom("nsfw_user_preferences",).where("user_id", "=", userId,).execute();
  thisL.log.info("Moderation data deleted for user", { userId, },);
}
