// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 520

/**
 * Asset batch routes (gallery batch operations §7.7).
 *
 *   POST /api/assets/batch-download — server-side zip of the selected assets
 *   POST /api/assets/download-all   — server-side zip of the gallery's current filter set
 *   POST /api/assets/batch-delete   — delete the selected caller-owned assets
 *   GET  /api/assets/preferences    — caller's download-naming override (null = admin default)
 *   PUT  /api/assets/preferences    — set/clear the caller's download-naming override
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
import { resolveEffectiveNaming, } from "../assets/download-resolution";
import {
  type AssetRecord,
  canAccessAsset,
  deleteAsset,
  downloadFileName,
  type DownloadNaming,
  getAsset,
  getAssetData,
  getDownloadNaming,
  nsfwFlaggedAssetIds,
  setDownloadNaming,
} from "../assets/service";
import type { Config, } from "../config/schema";
import { deriveChatKeyForChat, getSmk, } from "../crypto";
import type { ChatKey, } from "../crypto/chat-keys";
import { AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { canAccessNsfw, } from "../middleware/nsfw-gate";
import { can, } from "../users/permissions";
import {
  AssetBatchDeleteResponse,
  AssetBatchIdsBody,
  AssetDownloadAllBody,
  AssetPreferencesBody,
  AssetPreferencesResponse,
  ErrorResponse,
} from "../validation/schemas";
import {
  forbiddenResponse,
  jsonResponse,
  notFoundResponse,
  requireUserId,
} from "./http-utils";
import { applyGalleryAssetFilters, inheritedHiddenAssetIds, } from "./views/gallery";

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
 * Cap for the download-all route: one request zips at most this many assets.
 * Explicit selections stay on the 200-id body cap; download-all takes the
 * whole visible filter set, so it gets its own (still bounded) ceiling and
 * reports truncation via `X-Download-Truncated`.
 */
export const DOWNLOAD_ALL_MAX = 500;

/**
 * Decrypt one chat-encrypted asset for the zip. The asset must carry an
 * `asset_links` row for the requesting chat — the same linkage the single
 * download authorizes against — otherwise it reports the skip.
 * @param opts
 * @returns the decrypted bytes, or the encrypted skip class.
 */
async function resolveEncryptedAssetBytes(opts: {
  database: Kysely<DB>;
  uploadDir: string;
  assetId: string;
  chatId: string;
  chatKey: ChatKey;
},): Promise<{ kind: "bytes"; bytes: Buffer } | { kind: "skip"; reason: "encrypted" }> {
  const { database, uploadDir, assetId, chatId, chatKey, } = opts;
  const linked = await database
    .selectFrom("asset_links",)
    .select("asset_id",)
    .where("asset_id", "=", assetId,)
    .where("entity_type", "=", "chat",)
    .where("entity_id", "=", chatId,)
    .executeTakeFirst();

  if (!linked) { return { kind: "skip", reason: "encrypted", }; }
  try {
    const bytes = await getAssetData(database, assetId, uploadDir, chatKey,);
    return bytes ? { kind: "bytes", bytes, } : { kind: "skip", reason: "encrypted", };
  } catch (error) {
    getLogger().child({ module: "assets-batch", },).warn("batch download skips undecryptable asset", {
      assetId,
      error: error instanceof Error ? error.message : String(error,),
    },);

    return { kind: "skip", reason: "encrypted", };
  }
}

/**
 * Resolve the zippable bytes for one accessible, NSFW-cleared asset.
 * Chat-encrypted assets decrypt only when the request names the chat they
 * are linked to (via `asset_links`) and the chat key derives; every other
 * encrypted asset — and every file missing on disk — reports its skip class
 * instead of throwing, so one bad asset never sinks the whole zip.
 * @param opts
 * @returns the bytes, or the skip class for the response counters.
 */
async function resolveBatchAssetBytes(opts: {
  database: Kysely<DB>;
  uploadDir: string;
  asset: AssetRecord;
  chatId: string | null;
  chatKey: ChatKey | null;
},): Promise<{ kind: "bytes"; bytes: Buffer } | { kind: "skip"; reason: "encrypted" | "missing" }> {
  const { database, uploadDir, asset, chatId, chatKey, } = opts;
  const encrypted = asset.encryption_tier !== "public" && asset.encrypted_key_id !== null;
  if (!encrypted) {
    const bytes = await getAssetData(database, asset.id, uploadDir,);
    return bytes ? { kind: "bytes", bytes, } : { kind: "skip", reason: "missing", };
  }

  if (!chatId || !chatKey) { return { kind: "skip", reason: "encrypted", }; }
  return resolveEncryptedAssetBytes({ database, uploadDir, assetId: asset.id, chatId, chatKey, },);
}

/**
 * Build the zip for the accessible subset of the selected assets. Files
 * missing on disk are skipped; chat-encrypted assets are decrypted into the
 * zip only when the request names the chat they are linked to (same
 * `asset_links` row the single download authorizes against) — otherwise
 * skipped and counted. Every skip class is counted so the zip response
 * headers stay an honest manifest of what was left out.
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param opts.userId
 * @param opts.userRole
 * @param opts.ids
 * @param opts.naming - download filename scheme applied to every zip entry.
 * @param opts.chatId - optional chat context for decrypting linked encrypted assets.
 * @returns Included assets, per-class skip counts, and the (possibly empty) zip.
 */
async function buildBatchZip(
  opts: {
    database: Kysely<DB>;
    config: Config;
    userId: string;
    userRole: string | null;
    ids: string[];
    naming: DownloadNaming;
    chatId?: string | null;
  },
): Promise<{
  included: AssetRecord[];
  nsfwSkipped: number;
  encryptedSkipped: number;
  missingSkipped: number;
  zip: JSZip;
}> {
  const { database, config, userId, userRole, ids, naming, chatId, } = opts;
  const log = getLogger().child({ module: "assets-batch", },);

  const nsfwAllowed = (await canAccessNsfw(database, config, userId,)).allowed;
  const flagged = nsfwAllowed ? new Set<string>() : await nsfwFlaggedAssetIds(database, ids,);

  // One key for the whole request: derivation failure (or no SMK) leaves
  // every encrypted asset skipped — never silently stored in the clear.
  let chatKey: ChatKey | null = null;
  if (chatId) {
    const smk = getSmk();
    if (smk) {
      try {
        chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      } catch (error) {
        log.warn("batch download cannot derive chat key; encrypted assets will be skipped", {
          error: error instanceof Error ? error.message : String(error,),
        },);
      }
    }
  }

  const zip = new JSZip();
  const taken = new Map<string, number>();
  const included: AssetRecord[] = [];
  let nsfwSkipped = 0;
  let encryptedSkipped = 0;
  let missingSkipped = 0;

  for (const id of ids) {
    const asset = await getAsset(database, id,);
    if (!asset) { continue; }
    if (!(await canAccessAsset(database, id, userId, userRole,))) { continue; }
    if (flagged.has(id,)) {
      nsfwSkipped++;
      continue;
    }

    const outcome = await resolveBatchAssetBytes({
      database,
      uploadDir: config.assets.uploadDir,
      asset,
      chatId: chatId ?? null,
      chatKey,
    },);

    if (outcome.kind === "skip") {
      if (outcome.reason === "encrypted") {
        log.debug("batch download skips chat-encrypted asset", { assetId: id, },);
        encryptedSkipped++;
      } else {
        log.warn("batch download skips asset with missing file", { assetId: id, },);
        missingSkipped++;
      }

      continue;
    }

    zip.file(zipEntryName(downloadFileName(asset, naming,), taken,), outcome.bytes,);
    included.push(asset,);
  }

  return { included, nsfwSkipped, encryptedSkipped, missingSkipped, zip, };
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

            const naming = await resolveEffectiveNaming({
              database,
              config,
              userId,
              override: body.naming ?? null,
            },);

            const { included, nsfwSkipped, encryptedSkipped, missingSkipped, zip, } = await buildBatchZip({
              database,
              config,
              userId,
              userRole: userRole ?? null,
              ids,
              naming,
              chatId: body.chatId ?? null,
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
              nsfwSkipped,
              encryptedSkipped,
              missingSkipped,
              bytes: buffer.byteLength,
            },);

            return new Response(new Uint8Array(buffer,), {
              headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="assets-batch-${Date.now()}.zip"`,
                "X-Download-Included": String(included.length,),
                "X-Download-Nsfw-Skipped": String(nsfwSkipped,),
                "X-Download-Encrypted-Skipped": String(encryptedSkipped,),
                "X-Download-Missing-Skipped": String(missingSkipped,),
              },
            },);
          },
          { body: AssetBatchIdsBody, },
        )
        // ── Download all (server-side zip of the gallery filter set) ──
        .post(
          `${prefix}/assets/download-all`,
          async (ctx,) => {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            const { userRole, } = ctx as unknown as BatchAuthContext;
            const body = ctx.body as typeof AssetDownloadAllBody.static;
            const isAdmin = can(userRole ?? null, "admin.character",);

            // Same visibility + linked-entity + tag filters as the gallery
            // grid and search, so the zip holds exactly what the requester
            // sees. Per-asset access, NSFW, and encryption rules still apply
            // inside buildBatchZip (belt and suspenders by design).
            let qb = database.selectFrom("assets",).select("id",);
            qb = applyGalleryAssetFilters(qb, {
              actorId: userId,
              isAdmin,
              entityType: body.entityType ?? null,
              entityId: body.entityId ?? null,
              tag: body.tag ?? null,
            },);

            const q = body.q?.toLowerCase().trim() ?? "";
            if (q) { qb = qb.where("filename", "like", `%${q}%`,); }
            if (body.type && body.type !== "all" && Object.values(AssetType,).includes(body.type as AssetType,)) {
              qb = qb.where("asset_type", "=", body.type as AssetType,);
            }

            // Qualified: the entity join brings a second `created_at`
            // (asset_links) into scope.
            const rows = await qb
              .orderBy("assets.created_at", "desc",)
              .limit(DOWNLOAD_ALL_MAX + 1,)
              .execute();

            const truncated = rows.length > DOWNLOAD_ALL_MAX;
            const hidden = await inheritedHiddenAssetIds(
              database,
              rows.slice(0, DOWNLOAD_ALL_MAX,).map((row,) => row.id),
              userId,
              userRole ?? null,
            );

            const ids = rows
              .slice(0, DOWNLOAD_ALL_MAX,)
              .map((row,) => row.id)
              .filter((id,) => !hidden.has(id,));

            const naming = await resolveEffectiveNaming({
              database,
              config,
              userId,
              override: body.naming ?? null,
            },);

            const { included, nsfwSkipped, encryptedSkipped, missingSkipped, zip, } = await buildBatchZip({
              database,
              config,
              userId,
              userRole: userRole ?? null,
              ids,
              naming,
              chatId: body.chatId ?? null,
            },);

            if (included.length === 0) {
              if (nsfwSkipped > 0) {
                return forbiddenResponse("Matching assets are NSFW-restricted for this account",);
              }

              return notFoundResponse("No downloadable assets match these filters",);
            }

            const buffer = await zip.generateAsync({ type: "nodebuffer", },);
            log.info("Download-all assets", {
              matched: rows.length,
              truncated,
              included: included.length,
              nsfwSkipped,
              encryptedSkipped,
              missingSkipped,
              bytes: buffer.byteLength,
            },);

            return new Response(new Uint8Array(buffer,), {
              headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="assets-all-${Date.now()}.zip"`,
                "X-Download-Included": String(included.length,),
                "X-Download-Nsfw-Skipped": String(nsfwSkipped,),
                "X-Download-Encrypted-Skipped": String(encryptedSkipped,),
                "X-Download-Missing-Skipped": String(missingSkipped,),
                ...(truncated ? { "X-Download-Truncated": "true", } : {}),
              },
            },);
          },
          { body: AssetDownloadAllBody, },
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
        )
        // ── Download preferences ───────────────────────────────
        .get(
          `${prefix}/assets/preferences`,
          async (ctx,) => {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            return jsonResponse({
              ok: true,
              downloadNaming: await getDownloadNaming(database, userId,),
            },);
          },
          { response: { 200: AssetPreferencesResponse, 401: ErrorResponse, }, },
        )
        .put(
          `${prefix}/assets/preferences`,
          async (ctx,) => {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            const body = ctx.body as typeof AssetPreferencesBody.static;
            const downloadNaming = await setDownloadNaming(database, userId, body.downloadNaming,);
            return jsonResponse({ ok: true, downloadNaming, },);
          },
          {
            body: AssetPreferencesBody,
            response: { 200: AssetPreferencesResponse, 401: ErrorResponse, },
          },
        ),);
}
