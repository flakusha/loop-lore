// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — preferences
 *
 * Split into read-only `get` (no side effect) and `getOrCreateOwn`
 * (write semantics — lazy default creation on first self-write).
 *
 * The `getPreferences` alias preserves the historical contract for
 * callers that already imported the lazy-create form (block, ban,
 * self-update). New admin read paths MUST use `get` so an admin GET
 * never materialises a phantom row for a user who never configured NSFW.
 */
import type { NsfwAccessStatus, } from "../../db/enums";
import type { NsfwModerationServiceContext, NsfwUserPrefs, } from "./types";

export interface GetPreferencesArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
}

/**
 * Read-only fetch — returns null when no preferences row exists.
 * Does NOT create a phantom row.
 */
export async function get({ thisL, userId, }: GetPreferencesArgs,): Promise<NsfwUserPrefs | null> {
  const row = await thisL.db
    .selectFrom("nsfw_user_preferences",)
    .where("user_id", "=", userId,)
    .selectAll()
    .executeTakeFirst();
  return row ? mapPrefs(row,) : null;
}

/**
 * Backward-compatibility alias. Kept for callers that import the lazy-create
 * form (block, ban, self-update). Returns `NsfwUserPrefs | null`; if you need
 * write semantics on a miss, use {@link getOrCreateOwn}.
 */
export const getPreferences = get;

export interface GetOrCreateOwnArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
}

/**
 * Read-or-create — used by self-update, block, and ban flows. Write
 * semantics are intentional: callers mutate the row anyway.
 */
export async function getOrCreateOwn({ thisL, userId, }: GetOrCreateOwnArgs,): Promise<NsfwUserPrefs> {
  const existing = await get({ thisL, userId, },);
  if (existing) { return existing; }

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
 * Uses `getOrCreateOwn` so the first self-write creates the row.
 */
export async function updatePreferences({ thisL, userId, updates, }: UpdatePreferencesArgs,): Promise<NsfwUserPrefs> {
  const now = new Date().toISOString();
  // Self-write: lazy-create is intentional
  await getOrCreateOwn({ thisL, userId, },);
  const sets: Record<string, unknown> = { updated_at: now, };
  if (updates.nsfwEnabled !== undefined) { sets.nsfw_enabled = updates.nsfwEnabled ? 1 : 0; }
  if (updates.maxRating !== undefined) { sets.max_rating = updates.maxRating; }
  await thisL.db.updateTable("nsfw_user_preferences",).set(sets,).where("user_id", "=", userId,).execute();
  // Read back (non-creating) — we just upserted so the row exists
  return (await get({ thisL, userId, },))!;
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
