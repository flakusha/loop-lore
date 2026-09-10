// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — tag proposition feed (gallery tagging G7).
 *
 * Propositions are derived from asset metadata through a pluggable
 * `TagPropositionSource` — the static token source ships now; a RAG / metadata
 * feed can be swapped in later without touching callers.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import { normalizeTag, } from "./tags";

/** Provenance of a proposed tag token. */
export type TagProvenance = "alt_text" | "filename";

/** A single proposed tag for an asset. */
export interface TagProposition {
  tag: string;
  provenance: TagProvenance;
}

/** Asset metadata a proposition source reads from. */
export interface PropositionAsset {
  filename: string;
  alt_text: string | null;
}

/**
 * Pluggable source of tag propositions. The static token source derives tags
 * from `alt_text` and `filename`; a RAG / metadata feed can implement the
 * same interface later and be injected without changing the feed logic.
 */
export interface TagPropositionSource {
  propose(asset: PropositionAsset,): string[];
}

/** Tokenizes a string into candidate tags: non-alphanumeric splits, lowercase. */
function tokenize(value: string,): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/,)
    .map((token,) => token.trim())
    .filter((token,) => token.length >= 2 && token.length <= 48);
}

/** Static proposition source — tokens from `alt_text` then `filename`. */
export const staticTagPropositionSource: TagPropositionSource = {
  propose(asset,): string[] {
    const fromAlt = asset.alt_text ? tokenize(asset.alt_text,) : [];
    const fromFilename = tokenize(asset.filename.replace(/\.[a-z0-9]+$/, "",),);
    return [...new Set([...fromAlt, ...fromFilename,],),];
  },
};

/**
 * Propose tags for an asset that are not already applied (in any scope) and
 * not dismissed by this viewer.
 * @param database
 * @param assetId
 * @param userId
 * @param source
 */
export async function proposeTags(
  database: Kysely<DB>,
  assetId: string,
  userId: string,
  source: TagPropositionSource = staticTagPropositionSource,
): Promise<TagProposition[]> {
  const asset = await database
    .selectFrom("assets",)
    .select(["filename", "alt_text",],)
    .where("id", "=", assetId,)
    .executeTakeFirst();
  if (!asset) { return []; }

  const candidates = source.propose(asset,);

  const applied = await database
    .selectFrom("asset_tags",)
    .select("tag",)
    .where("asset_id", "=", assetId,)
    .execute();
  const appliedSet = new Set(applied.map((row,) => row.tag),);

  const dismissed = await database
    .selectFrom("asset_tag_dismissals",)
    .select("tag",)
    .where("asset_id", "=", assetId,)
    .where("user_id", "=", userId,)
    .execute();
  const dismissedSet = new Set(dismissed.map((row,) => row.tag),);

  const altTokens = new Set(asset.alt_text ? tokenize(asset.alt_text,) : [],);
  const proposals: TagProposition[] = [];
  const seen = new Set<string>();
  for (const tag of candidates) {
    if (seen.has(tag,)) { continue; }
    seen.add(tag,);
    if (appliedSet.has(tag,) || dismissedSet.has(tag,)) { continue; }
    proposals.push({ tag, provenance: altTokens.has(tag,) ? "alt_text" : "filename", },);
  }
  return proposals;
}

/**
 * Record a dismissal so a proposed tag is not re-suggested for this asset.
 * @param database
 * @param assetId
 * @param tag
 * @param userId
 */
export async function dismissProposition(
  database: Kysely<DB>,
  assetId: string,
  tag: string,
  userId: string,
): Promise<void> {
  await database
    .insertInto("asset_tag_dismissals",)
    .values({ id: uid(), asset_id: assetId, tag: normalizeTag(tag,), user_id: userId, },)
    .onConflict((oc,) => oc.columns(["asset_id", "tag", "user_id",],).doNothing())
    .execute();
}
