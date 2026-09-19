// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Asset Service — tags (gallery tagging G7): per-viewer `user` tags and shared `global` tags. */
import type { Kysely, } from "kysely";
import { AssetTagScope, AssetTagSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { normalizeTag, scopeOwnerPredicate, } from "./tags-query";
import { deleteAssetTags, tagVocabulary, } from "./tags-vocabulary";

export { deleteAssetTags, normalizeTag, scopeOwnerPredicate, tagVocabulary, };
export type { UpsertTagContext, };

// ── Public record shape ────────────────────────────────────

/** A tag as returned to clients — excludes internal ownership columns. */
export interface AssetTagRecord {
  id: string;
  tag: string;
  scope: AssetTagScope;
  source: AssetTagSource;
}

// ── Scope filter helper ────────────────────────────────────

// (moved to ./tags-query.ts; re-exported above for single-module importers)

// ── List ───────────────────────────────────────────────────

/**
 * List tags visible to a viewer on an asset: every `global` tag plus the
 * viewer's own `user`-scoped tags.
 * @param database
 * @param assetId
 * @param userId
 * @returns visible tags ordered by tag
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

interface UpsertTagContext {
  database: Kysely<DB>;
  assetId: string;
  scope: AssetTagScope;
  ownerId: string | null;
}

/**
 * Insert one tag; no-op (returns existing) when already present in scope.
 * @param options - scope/tag context (single-argument options object)
 * @param options.database
 * @param options.assetId
 * @param options.scope
 * @param options.ownerId
 * @param fields - tag payload (`tag`, optional `source`)
 * @param fields.tag
 * @param fields.source
 * @returns the existing or newly inserted tag record
 */
async function insertTag(
  options: UpsertTagContext,
  fields: { tag: string; source?: AssetTagSource },
): Promise<AssetTagRecord> {
  const opts = { ...options, ...fields, };
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
 * @param options - single-argument options object
 * @param options.database
 * @param options.assetId
 * @param options.tag
 * @param options.scope
 * @param options.ownerId
 * @returns the tag record, or null for an empty tag
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
  return insertTag(options, { tag, },);
}

/**
 * Remove a tag from an asset in a scope. Caller enforces scope ownership.
 * @param database
 * @param assetId
 * @param tag
 * @param scope
 * @param ownerId
 * @returns resolves when the row is deleted
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
 * @param options - single-argument options object
 * @param options.database
 * @param options.assetId
 * @param options.oldTag
 * @param options.newTag
 * @param options.scope
 * @param options.ownerId
 * @returns the target tag record, or null when nothing changed
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

  const target = await insertTag(options, { tag: normalizedNew, },);
  // Insert target first; then drop the old row unconditionally.
  await removeAssetTag(database, assetId, normalizedOld, scope, ownerId,);
  return target;
}
