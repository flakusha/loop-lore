// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Asset Service — tag vocabulary + lifecycle GC (split from tags.ts). */
import type { Kysely, } from "kysely";
import { AssetTagScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { normalizeTag, scopeOwnerPredicate, } from "./tags-query";

/**
 * Distinct tag vocabulary visible to a viewer for autocomplete: every global
 * tag plus the viewer's own user-scoped tags. `q` narrows by prefix.
 * @param database
 * @param userId
 * @param q - optional prefix filter (normalized before matching)
 * @returns deduplicated visible tag strings
 */
export async function tagVocabulary(
  database: Kysely<DB>,
  userId: string | null,
  q?: string,
): Promise<string[]> {
  const prefix = q ? normalizeTag(q,) : "";
  const rows = await database
    .selectFrom("asset_tags",)
    .select("tag",)
    .where(scopeOwnerPredicate(userId,),)
    .distinct()
    .orderBy("tag", "asc",)
    .execute();

  const tags = rows.map((row,) => row.tag);
  if (prefix === "") {
    return [...new Set(tags,),];
  }
  return [...new Set(tags.filter((tag,) => tag.startsWith(prefix,)),),];
}

/**
 * GC all tag + dismissal rows for an asset (called from asset delete).
 * @param database
 * @param assetId
 * @returns resolves when both tables are cleaned
 */
export async function deleteAssetTags(database: Kysely<DB>, assetId: string,): Promise<void> {
  await database.deleteFrom("asset_tag_dismissals",).where("asset_id", "=", assetId,).execute();
  await database.deleteFrom("asset_tags",).where("asset_id", "=", assetId,).execute();
}

/** Re-export so existing single-module importers keep working. */
export { AssetTagScope, };
