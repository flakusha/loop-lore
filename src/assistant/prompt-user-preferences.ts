// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Prompt assembler — user preference cascade (split from prompt-assembler.ts). */
import type { Kysely, } from "kysely";
import type { OutputStylePreset, } from "../chat/output-style";
import { isValidPreset, type LengthPreset, } from "../chat/response-length";
import type { DB, } from "../db/schema";
import { parseJsonOr, } from "./prompt-utils";

/** User-level prompt preferences resolved from users.settings JSON. */
export interface UserPromptPreferences {
  outputStylePreset: OutputStylePreset | null;
  responseLengthPreset: LengthPreset | null;
  customInstructions: string | null;
}

/**
 * Load a user's prompt preferences from users.settings (output style,
 * response length, custom instructions).
 * @param db - database handle
 * @param userId - user id, or null when unauthenticated
 * @returns the resolved preferences (all null when no user/settings)
 */
export async function loadUserPromptPreferences(
  db: Kysely<DB>,
  userId: string | null | undefined,
): Promise<UserPromptPreferences> {
  const empty: UserPromptPreferences = {
    outputStylePreset: null,
    responseLengthPreset: null,
    customInstructions: null,
  };
  if (!userId) { return empty; }
  const userRow = await db
    .selectFrom("users",)
    .select("settings",)
    .where("id", "=", userId,)
    .executeTakeFirst();
  const userSettings = parseJsonOr<
    {
      outputStyle?: { preset?: OutputStylePreset };
      responseLength?: { preset?: LengthPreset };
      customInstructions?: string | null;
    } | null
  >(userRow?.settings ?? null, null,);
  const preset = userSettings?.responseLength?.preset;
  return {
    outputStylePreset: userSettings?.outputStyle?.preset ?? null,
    responseLengthPreset: typeof preset === "string" && isValidPreset(preset,) ? preset : null,
    customInstructions: typeof userSettings?.customInstructions === "string"
      ? userSettings.customInstructions
      : null,
  };
}
