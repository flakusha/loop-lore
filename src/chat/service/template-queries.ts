// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat setup template read queries — leaf module shared by
 * `templates.ts` (default seeding + listing) and `template-crud.ts`
 * (admin CRUD read-back after writes).
 *
 * Extracted to break the runtime cycle: `template-crud.ts` previously
 * imported `getChatSetupTemplate` from `templates.ts`, while
 * `templates.ts` re-exported the CRUD symbols from `template-crud.ts`.
 * Both files now read from this shared leaf.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils";
import type { ChatSetupTemplate, } from "./types";

/**
 * Parse the features JSON column into a string array.
 * @param raw Raw JSON column value.
 * @returns Parsed feature array or null.
 */
export function parseFeatures(raw: string | null,): string[] | null {
  if (!raw) { return null; }
  const parsed = safeJsonParse(raw,);
  if (!parsed.ok || !Array.isArray(parsed.value,)) { return null; }
  return Array.from(parsed.value, String,);
}

/**
 * Resolve a chat setup template by id or slug, with parsed features.
 * @param database Active Kysely database.
 * @param templateId Template id or slug.
 * @returns The template or null if not found.
 */
export async function getChatSetupTemplate(
  database: Kysely<DB>,
  templateId: string,
): Promise<ChatSetupTemplate | null> {
  const row = await database
    .selectFrom("chat_setup_templates",)
    .selectAll()
    .where((eb,) => eb.or([eb("id", "=", templateId,), eb("slug", "=", templateId,),],))
    .executeTakeFirst();
  if (!row) { return null; }
  return {
    ...(row as unknown as ChatSetupTemplate),
    features: parseFeatures((row as { features?: string | null }).features ?? null,),
  };
}
