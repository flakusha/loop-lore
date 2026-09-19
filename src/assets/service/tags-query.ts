// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Asset Service — shared tag query helpers (split from tags.ts for size). */
import type { ExpressionBuilder, ExpressionWrapper, Kysely, SqlBool, } from "kysely";
import { AssetTagScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";

/**
 * Normalize a tag for storage: trim, lowercase, collapse internal whitespace.
 * @param input
 * @returns the normalized tag
 */
export function normalizeTag(input: string,): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ",);
}

/**
 * Builder for the owner predicate: global rows always match; user rows must
 * match `ownerId`. Callers thread this into list/delete/update chaining.
 * @param userId - viewer id for user-scoped rows (null matches global only)
 * @returns a Kysely where-callback selecting visible tag rows
 */
export function scopeOwnerPredicate(
  userId: string | null,
): (eb: ExpressionBuilder<DB, "asset_tags">,) => ExpressionWrapper<DB, "asset_tags", SqlBool> {
  return (eb,) =>
    eb.or([
      eb("scope", "=", AssetTagScope.Global,),
      eb.and([
        eb("scope", "=", AssetTagScope.User,),
        eb("owner_id", "=", userId ?? "",),
      ],),
    ],);
}

/** Re-export so existing single-module importers keep working. */
export { AssetTagScope, };
export type { DB, Kysely, };
