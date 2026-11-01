// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW asset flag — the v1 rating signal.
 *
 * Assets carry no intrinsic rating column: an asset counts as NSFW when it
 * is linked to an actor whose `content_rating` is NSFW
 * (`asset_links.entity_type = 'actor'` → `actors.content_rating`).
 *
 * Consumers:
 * - `src/routes/assets.ts` batch download (gated callers get flagged assets
 *   omitted),
 * - message attachment serialization (`routes/messages/helpers.ts`) and the
 *   gallery view-model (`routes/views/view-models/gallery-grid.ts`), which
 *   surface the flag to clients so a user-level blur preference can cover
 *   permitted NSFW media behind a click-to-reveal affordance.
 */
import type { Kysely, } from "kysely";
import { AssetLinkEntity, } from "../../db/enums";
import type { ContentRating, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { isNsfwRating, } from "../../middleware/nsfw-gate/constants";

/**
 * Resolve the ids of assets linked to an NSFW-rated actor, in ONE query.
 * @param database Kysely handle
 * @param ids Candidate asset ids (deduplicated internally)
 * @returns {Promise<Set<string>>} The subset of `ids` flagged NSFW (possibly empty)
 */
export async function nsfwFlaggedAssetIds(
  database: Kysely<DB>,
  ids: readonly string[],
): Promise<Set<string>> {
  const flagged = new Set<string>();
  if (ids.length === 0) { return flagged; }

  const rows = await database
    .selectFrom("asset_links as al",)
    .innerJoin("actors as act", "act.id", "al.entity_id",)
    .select(["al.asset_id", "act.content_rating",],)
    .where("al.entity_type", "=", AssetLinkEntity.Actor,)
    .where("al.asset_id", "in", [...ids,],)
    .execute();

  for (const row of rows) {
    if (isNsfwRating(row.content_rating as ContentRating,)) {
      flagged.add(row.asset_id,);
    }
  }

  return flagged;
}
