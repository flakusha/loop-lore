// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 300

/**
 * Asset batch routes (gallery batch operations §7.7).
 *
 *   POST /api/assets/batch-download — server-side zip of the selected assets
 *   POST /api/assets/batch-delete   — delete the selected caller-owned assets
 *
 * Gates on BOTH endpoints:
 *   - Ownership/scope: download includes only assets the caller can access
 *     (`canAccessAsset` — owner, public, shared-with, or admin); delete
 *     follows the single-asset DELETE contract (owner-only, missing and
 *     not-yours indistinguishable via `requireAssetOwner` semantics).
 *     Inaccessible ids are silently skipped so neither response leaks which
 *     arbitrary asset ids exist.
 *   - NSFW rating visibility: an asset counts as NSFW when it is linked to an
 *     actor whose `content_rating` is NSFW (`asset_links` → `actors`) —
 *     assets carry no intrinsic rating column, so the actor link is the v1
 *     rating signal. Callers who fail the NSFW gate (`canAccessNsfw`: config
 *     toggle, age gate, moderation status) get those assets omitted. Delete
 *     deliberately does not consult NSFW: ownership already restricts it to
 *     the caller's own rows, and blocking owners from cleaning up their own
 *     content has no visibility upside.
 *   - Chat-encrypted assets are skipped in downloads (no chat context to
 *     derive the key from); those download individually via /assets/:id/raw.
 *
 * The zip is built buffered with JSZip — the established export pattern in
 * this repo (src/routes/export.ts) — bounded by the 200-id body cap.
 */
import { Elysia, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import { existsSync, readFileSync, } from "node:fs";
import { canAccessAsset, deleteAsset, getAsset, getAssetFilePath, } from "../assets/service";
import type { AssetRecord, } from "../assets/service";
import type { Config, } from "../config/schema";
import { AssetLinkEntity, } from "../db/enums";
import type { ContentRating, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { canAccessNsfw, isNsfwRating, } from "../middleware/nsfw-gate";
import { AssetBatchDeleteResponse, AssetBatchIdsBody, ErrorResponse, } from "../validation/schemas";
import {
  forbiddenResponse,
  jsonResponse,
  notFoundResponse,
  requireUserId,
} from "./http-utils";

/** Route options — database plus config (assets gate, upload dir, NSFW gate). */
export interface AssetsBatchOpts {
  database: Kysely<DB>;
  config: Config;
}

/** Auth-derived fields the batch handlers read (populated by createApp). */
interface BatchAuthContext {
  userRole: string | null;
}

/**
 * Resolve the ids of assets linked to an NSFW-rated actor, in ONE query.
 * @param database
 * @param ids Candidate asset ids.
 * @returns {Promise<Set<string>>}
 */
async function nsfwFlaggedAssetIds(database: Kysely<DB>, ids: string[],): Promise<Set<string>> {
  const flagged = new Set<string>();
  if (ids.length === 0) { return flagged; }

  const rows = await database
    .selectFrom("asset_links as al",)
    .innerJoin("actors as act", "act.id", "al.entity_id",)
    .select(["al.asset_id", "act.content_rating",],)
    .where("al.entity_type", "=", AssetLinkEntity.Actor,)
    .where("al.asset_id", "in", ids,)
    .execute();

  for (const row of rows) {
    if (isNsfwRating(row.content_rating as ContentRating,)) {
      flagged.add(row.asset_id,);
    }
  }

  return flagged;
}

/**
 * Dedupe zip entry names: sanitize like the single-asset download path and
 * suffix later collisions (`name-2.ext`) instead of silently overwriting.
 * @param name
 * @param taken Filename → times seen.
 * @returns {string}
 */
export function zipEntryName(name: string, taken: Map<string, number>,): string {
  const clean = name.replaceAll(/[^\w.-]+/g, "_",) || "asset";
  const seen = taken.get(clean,) ?? 0;
  taken.set(clean, seen + 1,);
  if (seen === 0) { return clean; }

  const dot = clean.lastIndexOf(".",);
  const stem = dot > 0 ? clean.slice(0, dot,) : clean;
  const ext = dot > 0 ? clean.slice(dot,) : "";
  return `${stem}-${seen + 1}${ext}`;
}

/**
 * Build the zip for the accessible subset of the selected assets. Chat-
 * encrypted assets and files missing on disk are skipped.
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param opts.userId
 * @param opts.userRole
 * @param opts.ids
 * @returns Included assets, the NSFW-skip count, and the (possibly empty) zip.
 */
async function buildBatchZip(
  opts: {
    database: Kysely<DB>;
    config: Config;
    userId: string;
    userRole: string | null;
    ids: string[];
  },
): Promise<{ included: AssetRecord[]; nsfwSkipped: number; zip: JSZip }> {
  const { database, config, userId, userRole, ids, } = opts;
  const log = getLogger().child({ module: "assets-batch", },);

  const nsfwAllowed = (await canAccessNsfw(database, config, userId,)).allowed;
  const flagged = nsfwAllowed ? new Set<string>() : await nsfwFlaggedAssetIds(database, ids,);

  const zip = new JSZip();
  const taken = new Map<string, number>();
  const included: AssetRecord[] = [];
  let nsfwSkipped = 0;

  for (const id of ids) {
    const asset = await getAsset(database, id,);
    if (!asset) { continue; }
    if (!(await canAccessAsset(database, id, userId, userRole,))) { continue; }
    if (flagged.has(id,)) {
      nsfwSkipped++;
      continue;
    }

    // Chat-encrypted bytes need the originating chat's key — not derivable
    // from a batch request without a chat context, so they are skipped.
    if (asset.encryption_tier !== "public" && asset.encrypted_key_id !== null) {
      log.debug("batch download skips chat-encrypted asset", { assetId: id, },);
      continue;
    }

    const filePath = getAssetFilePath(config.assets.uploadDir, asset.storage_path,);
    if (!existsSync(filePath,)) {
      log.warn("batch download skips asset with missing file", { assetId: id, },);
      continue;
    }

    zip.file(zipEntryName(asset.filename, taken,), readFileSync(filePath,),);
    included.push(asset,);
  }

  return { included, nsfwSkipped, zip, };
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia} Batch download/delete routes under `${prefix}/assets`.
 */
export function assetsRoutes(opts: AssetsBatchOpts, prefix = "/api",): Elysia {
  const { database, config, } = opts;
  const log = getLogger().child({ module: "assets-batch", },);

  return new Elysia({ name: "assets-batch", },)
    .guard({
      beforeHandle: () => {
        if (!config.assets.enabled) {
          return notFoundResponse("Asset system is disabled",);
        }
      },
    }, (app,) =>
      app
        // ── Batch download (server-side zip) ─────────────────────
        .post(
          `${prefix}/assets/batch-download`,
          async (ctx,) => {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            const { userRole, } = ctx as unknown as BatchAuthContext;
            const body = ctx.body as typeof AssetBatchIdsBody.static;
            const ids = [...new Set(body.ids,),];

            const { included, nsfwSkipped, zip, } = await buildBatchZip({
              database,
              config,
              userId,
              userRole: userRole ?? null,
              ids,
            },);

            if (included.length === 0) {
              if (nsfwSkipped > 0) {
                return forbiddenResponse("Selected assets are NSFW-restricted for this account",);
              }

              return notFoundResponse("No downloadable assets in selection",);
            }

            const buffer = await zip.generateAsync({ type: "nodebuffer", },);
            log.info("Batch asset download", {
              requested: ids.length,
              included: included.length,
              bytes: buffer.byteLength,
            },);

            return new Response(new Uint8Array(buffer,), {
              headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="assets-batch-${Date.now()}.zip"`,
              },
            },);
          },
          { body: AssetBatchIdsBody, },
        )
        // ── Batch delete ─────────────────────────────────────────
        .post(
          `${prefix}/assets/batch-delete`,
          async (ctx,) => {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            const body = ctx.body as typeof AssetBatchIdsBody.static;
            const ids = [...new Set(body.ids,),];

            const deleted: string[] = [];
            for (const id of ids) {
              // Owner-only; missing and not-yours are indistinguishable — the
              // same contract as the single-asset DELETE in assets/controller.ts.
              const asset = await getAsset(database, id,);
              if (!asset || asset.owner_id !== userId) { continue; }
              if (await deleteAsset({ database, assetId: id, uploadDir: config.assets.uploadDir, },)) {
                deleted.push(id,);
              }
            }

            if (deleted.length === 0) {
              return notFoundResponse("No deletable assets in selection",);
            }

            log.info("Batch asset delete", { requested: ids.length, deleted: deleted.length, },);
            return jsonResponse({ ok: true, deleted, },);
          },
          {
            body: AssetBatchIdsBody,
            response: {
              200: AssetBatchDeleteResponse,
              401: ErrorResponse,
              404: ErrorResponse,
            },
          },
        ),);
}
