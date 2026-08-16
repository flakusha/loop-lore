// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — preferences
 *
 * Reading (with lazy default creation) and updating a user's NSFW prefs.
 */
import type { NsfwAccessStatus, } from "../../db/enums";
import type { NsfwModerationServiceContext, NsfwUserPrefs, } from "./types";

export interface GetPreferencesArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
}

/**
 * Read the user's NSFW preferences, lazily creating default prefs on first
 * access.
 *
 * @param args.thisL - The moderation service instance
 * @param args.userId - Target user ID
 * @returns The user's NSFW preferences
 */
export async function getPreferences({ thisL, userId, }: GetPreferencesArgs,): Promise<NsfwUserPrefs> {
  const row = await thisL.db
    .selectFrom("nsfw_user_preferences",)
    .where("user_id", "=", userId,)
    .selectAll()
    .executeTakeFirst();

  if (row) { return mapPrefs(row,); }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await thisL.db
    .insertInto("nsfw_user_preferences",)
    .values({
      id,
      user_id: userId,
      nsfw_enabled: 1,
      max_rating: "nsfw_mild",
      access_status: "clear",
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
    accessStatus: "clear",
    shadowNsfw: false,
    blockReason: null,
    bannedAt: null,
    bannedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdatePreferencesArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
  updates: Partial<Pick<NsfwUserPrefs, "nsfwEnabled" | "maxRating">>;
}

/**
 * Update a user's NSFW preferences (enabled flag and/or max rating).
 *
 * @param args.thisL - The moderation service instance
 * @param args.userId - Target user ID
 * @param args.updates - Fields to change
 * @returns The updated preferences
 */
export async function updatePreferences({ thisL, userId, updates, }: UpdatePreferencesArgs,): Promise<NsfwUserPrefs> {
  const now = new Date().toISOString();
  await thisL.getPreferences(userId,);
  const sets: Record<string, unknown> = { updated_at: now, };
  if (updates.nsfwEnabled !== undefined) { sets.nsfw_enabled = updates.nsfwEnabled ? 1 : 0; }
  if (updates.maxRating !== undefined) { sets.max_rating = updates.maxRating; }
  await thisL.db.updateTable("nsfw_user_preferences",).set(sets,).where("user_id", "=", userId,).execute();
  return thisL.getPreferences(userId,);
}

/** Map a storage row (snake_case) to the camel-cased NsfwUserPrefs shape. */
export function mapPrefs(
  row: {
    id: string;
    user_id: string;
    nsfw_enabled: number;
    max_rating: string;
    access_status: NsfwAccessStatus;
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
    accessStatus: row.access_status,
    shadowNsfw: row.shadow_nsfw === 1,
    blockReason: row.block_reason,
    bannedAt: row.banned_at,
    bannedBy: row.banned_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
