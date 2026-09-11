// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Asset Service — tags (gallery tagging G7): per-viewer `user` tags and shared `global` tags. */
import type { ExpressionBuilder, ExpressionWrapper, Kysely, SqlBool, } from "kysely";
import { AssetTagScope, AssetTagSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

// ── Tag normalization ──────────────────────────────────────

/**
 * Normalize a tag for storage: trim, lowercase, collapse internal whitespace.
 * @param input
 */
export function normalizeTag(input: string,): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ",);
}

// ── Public record shape ────────────────────────────────────

/** A tag as returned to clients — excludes internal ownership columns. */
export interface AssetTagRecord {
  id: string;
  tag: string;
  scope: AssetTagScope;
  source: AssetTagSource;
}

// ── Scope filter helper ────────────────────────────────────

/**
 * Builder for the owner predicate: global rows always match; user rows must
 * match `ownerId`. Callers thread this into list/delete/update chaining.
 */
function scopeOwnerPredicate(
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

// ── List ───────────────────────────────────────────────────

/**
 * List tags visible to a viewer on an asset: every `global` tag plus the
 * viewer's own `user`-scoped tags.
 * @param database
 * @param assetId
 * @param userId
 */
export async function listAssetTags(
  database: Kysely<DB>,
  assetId: string,
  userId: string | null,
): Promise<AssetTagRecord[]> {
  const rows = await database
    .selectFrom("asset_tags",)
    .select(["id", "tag", "scope", "source",],)
    .where("asset_id", "=", assetId,)
    .where(scopeOwnerPredicate(userId,),)
    .orderBy("tag", "asc",)
    .execute();

  return rows.map((row,) => ({
    id: row.id,
    tag: row.tag,
    scope: row.scope as AssetTagScope,
    source: row.source as AssetTagSource,
  }));
}

// ── Add / remove / rename ──────────────────────────────────

interface UpsertTagOptions {
  database: Kysely<DB>;
  assetId: string;
  tag: string;
  scope: AssetTagScope;
  ownerId: string | null;
  source?: AssetTagSource;
}

/** Insert one tag; no-op (returns existing) when already present in scope. */
async function insertTag(opts: UpsertTagOptions,): Promise<AssetTagRecord> {
  const { database, assetId, tag, scope, ownerId, source, } = opts;
  let existingQuery = database
    .selectFrom("asset_tags",)
    .select(["id", "tag", "scope", "source",],)
    .where("asset_id", "=", assetId,)
    .where("tag", "=", tag,)
    .where("scope", "=", scope,);
  if (scope === AssetTagScope.User) {
    existingQuery = existingQuery.where("owner_id", "=", ownerId ?? "",);
  }
  const existing = await existingQuery.executeTakeFirst();

  if (existing) {
    const { id, tag, scope, source, } = existing;
    return { id, tag, scope: scope as AssetTagScope, source: source as AssetTagSource, };
  }

  const id = uid();
  const sourceValue = source ?? AssetTagSource.Manual;
  await database
    .insertInto("asset_tags",)
    .values({
      id,
      asset_id: assetId,
      tag,
      scope,
      owner_id: ownerId,
      source: sourceValue,
    },)
    .execute();

  return { id, tag, scope, source: sourceValue, };
}

/**
 * Add a tag to an asset in the given scope; null when the normalized tag is
 * empty. Deduplicates by normalized tag. Caller enforces scope ownership.
 * @param options
 */
export async function addAssetTag(options: {
  database: Kysely<DB>;
  assetId: string;
  tag: string;
  scope: AssetTagScope;
  ownerId: string | null;
},): Promise<AssetTagRecord | null> {
  const tag = normalizeTag(options.tag,);
  if (tag === "") { return null; }
  return insertTag({
    database: options.database,
    assetId: options.assetId,
    tag,
    scope: options.scope,
    ownerId: options.ownerId,
  },);
}

/**
 * Remove a tag from an asset in a scope. Caller enforces scope ownership.
 * @param database
 * @param assetId
 * @param tag
 * @param scope
 * @param ownerId
 */
export async function removeAssetTag(
  database: Kysely<DB>,
  assetId: string,
  tag: string,
  scope: AssetTagScope,
  ownerId: string | null,
): Promise<void> {
  let deleteQuery = database
    .deleteFrom("asset_tags",)
    .where("asset_id", "=", assetId,)
    .where("tag", "=", tag,)
    .where("scope", "=", scope,);
  if (scope === AssetTagScope.User) {
    deleteQuery = deleteQuery.where("owner_id", "=", ownerId ?? "",);
  }
  await deleteQuery.execute();
}

/**
 * Rename a tag within a scope; null when the pair is identical or the new
 * tag is empty. When the target exists the old row is dropped; otherwise
 * the old row's tag is updated in place so its `id` is stable.
 * @param options
 */
export async function renameAssetTag(options: {
  database: Kysely<DB>;
  assetId: string;
  oldTag: string;
  newTag: string;
  scope: AssetTagScope;
  ownerId: string | null;
},): Promise<AssetTagRecord | null> {
  const { database, assetId, oldTag, newTag, scope, ownerId, } = options;
  const normalizedNew = normalizeTag(newTag,);
  const normalizedOld = normalizeTag(oldTag,);
  if (normalizedNew === "") { return null; }

  if (normalizedNew === normalizedOld) {
    return null;
  }

  const target = await insertTag({
    database,
    assetId,
    tag: normalizedNew,
    scope,
    ownerId,
  },);
  // Insert target first; then drop the old row unconditionally.
  await removeAssetTag(database, assetId, normalizedOld, scope, ownerId,);
  return target;
}

// ── Vocabulary (autocomplete) ──────────────────────────────

/**
 * Distinct tag vocabulary visible to a viewer for autocomplete: every global
 * tag plus the viewer's own user-scoped tags. `q` narrows by prefix.
 * @param database
 * @param userId
 * @param q
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
 */
export async function deleteAssetTags(database: Kysely<DB>, assetId: string,): Promise<void> {
  await database.deleteFrom("asset_tag_dismissals",).where("asset_id", "=", assetId,).execute();
  await database.deleteFrom("asset_tags",).where("asset_id", "=", assetId,).execute();
}
