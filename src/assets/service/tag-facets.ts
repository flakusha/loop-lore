// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-asset tag facets for the gallery grid: the tag names a given viewer may
 * see on each asset — global tags plus their own user-scoped tags. Feeds the
 * `data-tags` card attribute and the `tag` filter param on the gallery views.
 * Values are read live from `asset_tags` on every render, so a tag rename
 * propagates to the facets without any cache invalidation.
 */
import type { Kysely, } from "kysely";
import { AssetTagScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";

/**
 * Tag names per asset id, visible to `userId` (anonymous viewers match global
 * rows only). Sorted ascending per asset; assets without visible tags are
 * absent from the map.
 * @param database
 * @param assetIds
 * @param userId
 * @returns Map of asset id to its visible tag names.
 */
export async function visibleTagNames(
  database: Kysely<DB>,
  assetIds: readonly string[],
  userId: string | null,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (assetIds.length === 0) { return map; }
  const rows = await database
    .selectFrom("asset_tags",)
    .select(["asset_id", "tag",],)
    .where("asset_id", "in", assetIds as never,)
    .where((eb,) =>
      eb.or([
        eb("scope", "=", AssetTagScope.Global,),
        eb("owner_id", "=", userId ?? "",),
      ],)
    )
    .orderBy("tag", "asc",)
    .execute();
  for (const row of rows) {
    const tags = map.get(row.asset_id,) ?? [];
    tags.push(row.tag,);
    map.set(row.asset_id, tags,);
  }
  return map;
}
