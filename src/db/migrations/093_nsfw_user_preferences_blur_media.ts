// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 093_nsfw_user_preferences_blur_media
 *
 * Per-user preference to blur NSFW-flagged media in the UI even when the
 * user is fully permitted to view it (age gate + consent + nsfw_enabled
 * already passed). 0 = show media directly (default — no behavior change
 * for existing users); 1 = render NSFW-flagged images blurred/covered
 * behind a click-to-reveal affordance. Reveal is a client-side toggle
 * only; permission was established before render, never re-checked.
 */
import { type Kysely, } from "kysely";

/** Add the nsfw_blur_media column to nsfw_user_preferences. */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("nsfw_user_preferences",)
    .addColumn("nsfw_blur_media", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
}

/** Drop the nsfw_blur_media column. */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("nsfw_user_preferences",).dropColumn("nsfw_blur_media",).execute();
}
