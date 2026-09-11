// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 590

/**
 * Asset Controller
 *
 * Route handlers for asset CRUD operations.
 * Delegates to asset service for business logic.
 *
 *   GET    /api/assets              — list assets (paginated, filterable)
 *   POST   /api/assets              — upload new asset (multipart)
 *   GET    /api/assets/:id          — get asset metadata
 *   GET    /api/assets/:id/raw      — serve original file
 *   GET    /api/assets/:id/download — download file (attachment)
 *   GET    /api/assets/:id/thumb    — serve thumbnail
 *   GET    /api/assets/:id/compressed — serve compressed variant
 *   POST   /api/assets/:id/signed-url/:action — mint time-limited signed URL
 *   DELETE /api/assets/:id          — delete asset
 *   POST   /api/assets/:id/links    — link to entity
 *   DELETE /api/assets/:id/links/:linkId — unlink from entity
 *   GET    /api/assets/:id/transform — resolved framing metadata (?context=)
 *   PUT    /api/assets/:id/transform — upsert framing metadata (owner only)
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { deriveChatKeyForChat, getSmk, } from "../crypto";
import type { AssetLinkEntity, } from "../db/enums";
import { AssetVisibility, TransformContext, } from "../db/enums";
import type { DB, } from "../db/schema";
import {
  badRequestResponse,
  forbiddenResponse,
  HttpStatus,
  jsonCreated,
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
  notFoundResponse,
  notOwnerResponse,
  requireUserId,
} from "../routes/http-utils";
import { jsonStringifyOr, } from "../utils";
import { safeFromUint8Array, } from "../utils/safe-buffer";
import {
  handleDownload,
  handleServeCompressed,
  handleServeRaw,
  resolveAsset,
  signedUrlAuth,
} from "./serve-handlers";
import {
  createAsset,
  deleteAsset,
  detectAssetType,
  getAssetLinks,
  getAssetShares,
  linkAsset,
  listAssets,
  resolveAssetTransform,
  shareAsset,
  unlinkAsset,
  unshareAsset,
  updateAssetVisibility,
  upsertAssetTransform,
  validateFileSize,
  validateMimeType,
} from "./service";
import type { AssetRecord, } from "./service";
import type { TransformValues, } from "./service/transforms";
import { isSignedUrlAction, resolveSignedUrlSecret, signAssetUrl, } from "./signed-url";
/** Upload options — also used by elysia-app.ts for the standalone POST /api/assets route. */
export interface UploadOpts {
  request: Request;
  userId: string;
  database: Kysely<DB>;
  uploadDir: string;
  maxFileSize: number;
  /** Chat ID for encryption context (optional — public storage when omitted). */
  chatId?: string;
  /** App config for encryption settings. */
  config?: Config;
}

/**
 * Load an asset and require the caller to be its owner.
 * Returns the asset on success, or a Response on failure.
 * @param database
 * @param assetId
 * @param userId
 * @returns void
 */
async function requireAssetOwner(
  database: Kysely<DB>,
  assetId: string,
  userId: string,
): Promise<AssetRecord | Response> {
  const asset = await database
    .selectFrom("assets",)
    .selectAll()
    .where("id", "=", assetId,)
    .executeTakeFirst();
  if (!asset) { return notFoundResponse("Asset not found",); }
  if (asset.owner_id !== userId) { return notOwnerResponse("Asset",); }
  return asset;
}

export function assetRoutes({ database, config, }: { database: Kysely<DB>; config: Config },) {
  return (
    new Elysia({ name: "assets", },)
      .guard({
        beforeHandle: () => {
          if (!config.assets.enabled) {
            return notFoundResponse("Asset system is disabled",);
          }
        },
      },)
      // ── Collection routes ─────────────────────────────
      .get("/api/assets", async (ctx,) => {
        const searchParams = new URL(ctx.request.url,).searchParams;
        const page = Number(searchParams.get("page",) ?? "1",);
        const pageSize = Math.min(Number(searchParams.get("pageSize",) ?? "50",), 200,);
        const entityType = searchParams.get("entity_type",) ?? undefined;
        const entityId = searchParams.get("entity_id",) ?? undefined;
        const label = searchParams.get("label",) ?? undefined;
        const userId = (ctx as any).userId as string | null ?? null;
        const userRole = (ctx as any).userRole as string | null ?? null;

        const result = await listAssets(database, {
          page,
          pageSize,
          entityType: entityType as AssetLinkEntity,
          entityId,
          label,
          actorId: userId,
          actorRole: userRole,
        },);
        return jsonPaginated({ data: result.data, total: result.total, page, pageSize, },);
      },)
      // NOTE: POST /api/assets is registered directly in elysia-app.ts (not here)
      // as a workaround for Elysia 1.4.x body consumption: when a child plugin
      // containing routes that call request.json() is .use()d into a parent,
      // Elysia's internal body parser consumes the multipart body stream before
      // the upload handler can call request.formData(). Registering the multipart
      // route directly on the parent app avoids this issue.
      // ── Single asset routes ──────────────────────────
      .get("/api/assets/:id", async (ctx,) => {
        const userId = (ctx as any).userId as string | null ?? null;
        const userRole = (ctx as any).userRole as string | null ?? null;
        const resolved = await resolveAsset(database, ctx.params.id, userId, userRole,);
        if (resolved instanceof Response) { return resolved; }
        return jsonResponse(resolved.asset,);
      },)
      .patch("/api/assets/:id", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const body = ctx.body as { visibility?: string };
        if (
          !body.visibility ||
          ![AssetVisibility.Private, AssetVisibility.Shared, AssetVisibility.Public,].includes(
            body.visibility as AssetVisibility,
          )
        ) {
          return badRequestResponse("Invalid visibility. Must be private, shared, or public",);
        }

        const updated = await updateAssetVisibility({
          database,
          assetId: ctx.params.id,
          visibility: body.visibility as AssetVisibility,
          actorId: userId,
        },);
        if (!updated) {
          return notOwnerResponse("Asset",);
        }
        return jsonResponse({ id: updated.id, visibility: updated.visibility, },);
      },)
      .delete("/api/assets/:id", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const owned = await requireAssetOwner(database, ctx.params.id, userId,);
        if (owned instanceof Response) { return owned; }

        const deleted = await deleteAsset({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
        },);
        if (!deleted) {
          return notFoundResponse("Asset not found",);
        }
        return jsonNoContent();
      },)
      // -- Transform routes (face-anchor / framing metadata) ----
      .get("/api/assets/:id/transform", async (ctx,) => {
        const searchParams = new URL(ctx.request.url,).searchParams;
        const context = searchParams.get("context",) ?? TransformContext.Default;
        if (!(Object.values(TransformContext,) as string[]).includes(context,)) {
          return badRequestResponse("Invalid context",);
        }
        const resolved = await resolveAsset(
          database,
          ctx.params.id,
          (ctx as any).userId ?? null,
          (ctx as any).userRole ?? null,
        );
        if (resolved instanceof Response) { return resolved; }
        const transform = await resolveAssetTransform(database, ctx.params.id, context as TransformContext,);
        if (!transform) { return notFoundResponse("No transform for this context",); }
        return jsonResponse(transform,);
      },)
      .put("/api/assets/:id/transform", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const owned = await requireAssetOwner(database, ctx.params.id, userId,);
        if (owned instanceof Response) { return owned; }
        const { context: rawContext, ...values } = ctx.body as TransformValues & { context?: string };
        const context = rawContext ?? TransformContext.Default;
        if (!(Object.values(TransformContext,) as string[]).includes(context,)) {
          return badRequestResponse("Invalid context",);
        }
        try {
          const row = await upsertAssetTransform(database, ctx.params.id, context as TransformContext, values,);
          return jsonResponse(row,);
        } catch (err) {
          return badRequestResponse(err instanceof Error ? err.message : "Invalid transform",);
        }
      },)
      // ── File serving routes ──────────────────────────
      .get("/api/assets/:id/raw", async (ctx,) => {
        const searchParams = new URL(ctx.request.url,).searchParams;
        const chatId = searchParams.get("chatId",) ?? undefined;
        return handleServeRaw({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
          chatId,
          ...signedUrlAuth(searchParams, "raw", config,),
        },);
      },)
      .get("/api/assets/:id/download", async (ctx,) => {
        const searchParams = new URL(ctx.request.url,).searchParams;
        const chatId = searchParams.get("chatId",) ?? undefined;
        return handleDownload({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
          chatId,
          ...signedUrlAuth(searchParams, "download", config,),
        },);
      },)
      .get("/api/assets/:id/thumb", async (ctx,) => {
        const searchParams = new URL(ctx.request.url,).searchParams;
        return handleServeCompressed({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          variant: "thumb",
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
          ...signedUrlAuth(searchParams, "thumb", config,),
        },);
      },)
      .get("/api/assets/:id/compressed", async (ctx,) => {
        const searchParams = new URL(ctx.request.url,).searchParams;
        return handleServeCompressed({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          variant: "compressed",
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
          ...signedUrlAuth(searchParams, "compressed", config,),
        },);
      },)
      // ── Signed URLs ──────────────────────────────────
      // Mint a time-limited HMAC URL for a serve action. Gates on the same
      // access check as serving; the token then authorizes session-less
      // fetching (e.g. <img src>) until expiry.
      .post("/api/assets/:id/signed-url/:action", async (ctx,) => {
        const userId = (ctx as any).userId as string | null ?? null;
        const userRole = (ctx as any).userRole as string | null ?? null;
        const resolved = await resolveAsset(database, ctx.params.id, userId, userRole,);
        if (resolved instanceof Response) { return resolved; }

        const actionParam = ctx.params.action;
        if (!isSignedUrlAction(actionParam,)) {
          return badRequestResponse("Invalid signed-URL action",);
        }

        const secret = resolveSignedUrlSecret(config.assets.signedUrlSecret, config.auth.jwtSecret,);
        if (!secret) {
          return forbiddenResponse("Signed URLs are not configured",);
        }

        const expiresInSeconds = config.assets.signedUrlExpirySeconds ?? 900;
        const signed = await signAssetUrl({
          secret,
          assetId: ctx.params.id,
          action: actionParam,
          expiresInSeconds,
        },);
        const url = `/api/assets/${ctx.params.id}/${actionParam}?expires=${signed.expiresAt}&sig=${signed.token}`;
        return jsonResponse({ url, token: signed.token, expiresAt: signed.expiresAt, action: actionParam, },);
      },)
      // ── Links sub-routes ─────────────────────────────
      .get("/api/assets/:id/links", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const links = await getAssetLinks(database, ctx.params.id,);
        return jsonResponse(links,);
      },)
      .post("/api/assets/:id/links", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const owned = await requireAssetOwner(database, ctx.params.id, userId,);
        if (owned instanceof Response) { return owned; }

        const body = ctx.body as { entityType: AssetLinkEntity; entityId: string; label?: string };
        await linkAsset({
          database,
          assetId: ctx.params.id,
          link: body,
        },);
        return jsonCreated({ id: ctx.params.id, },);
      },)
      .delete("/api/assets/:id/links/:linkId", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const owned = await requireAssetOwner(database, ctx.params.id, userId,);
        if (owned instanceof Response) { return owned; }

        const body = ctx.body as { entityType?: string; entityId?: string };
        await unlinkAsset({
          database,
          assetId: ctx.params.id,
          entityType: (body.entityType ?? "") as AssetLinkEntity,
          entityId: body.entityId ?? "",
        },);
        return jsonNoContent();
      },)
      // ── Share sub-routes ─────────────────────────────
      .post("/api/assets/:id/share", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const body = ctx.body as { actor_id?: string };
        if (!body.actor_id) {
          return badRequestResponse("actor_id is required",);
        }

        const share = await shareAsset({
          database,
          assetId: ctx.params.id,
          sharedWithId: body.actor_id,
          sharedById: userId,
        },);
        if (!share) {
          return notOwnerResponse("Asset",);
        }
        return jsonCreated(share,);
      },)
      .delete("/api/assets/:id/share", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const owned = await requireAssetOwner(database, ctx.params.id, userId,);
        if (owned instanceof Response) { return owned; }

        const body = ctx.body as { actor_id?: string };
        if (!body.actor_id) {
          return badRequestResponse("actor_id is required",);
        }

        await unshareAsset({ database, assetId: ctx.params.id, sharedWithId: body.actor_id, },);
        return jsonNoContent();
      },)
      .get("/api/assets/:id/shares", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const shares = await getAssetShares(database, ctx.params.id,);
        return jsonResponse(shares,);
      },)
  );
}

export async function handleUpload({
  request,
  userId,
  database,
  uploadDir,
  maxFileSize,
  chatId,
  config,
}: UploadOpts,): Promise<Response> {
  const contentType = request.headers.get("content-type",) ?? "";

  if (!contentType.includes("multipart/form-data",)) {
    return badRequestResponse("Expected multipart/form-data",);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return badRequestResponse("Failed to parse multipart form data",);
  }

  const file = formData.get("file",);
  if (!file || !(file instanceof File)) {
    return badRequestResponse("file field is required",);
  }
  const bufferResult = safeFromUint8Array(Buffer.from(await file.arrayBuffer(),),);
  if (!bufferResult.ok) { return badRequestResponse(bufferResult.error.message,); }
  const buffer = bufferResult.buffer;
  const sizeError = validateFileSize(buffer.length, maxFileSize,);
  if (sizeError) { return badRequestResponse(sizeError,); }

  const mimeType = file.type || "application/octet-stream";
  const mimeError = validateMimeType(mimeType,);
  if (mimeError) { return badRequestResponse(mimeError,); }

  const altText = (formData.get("alt_text",) as string) ?? undefined;

  // Wire encryption context when chatId is provided
  let chatKey: import("../crypto/chat-keys").ChatKey | null = null;
  const pipelineConfig = config?.encryption
    ? {
      threshold: config.encryption.compressThreshold,
      algorithm: config.encryption.compressAlgorithm,
    }
    : undefined;

  if (chatId && config?.encryption?.serverEncryptionKey) {
    const smk = getSmk();
    if (smk) {
      try {
        chatKey = await deriveChatKeyForChat(database, chatId, smk,);
      } catch {
        // Not in an encrypted chat — fall through to public storage
        chatKey = null;
      }
    }
  }

  const { asset, duplicate, } = await createAsset({
    database,
    input: {
      ownerId: userId,
      filename: file.name,
      mimeType,
      assetType: detectAssetType(mimeType,),
      sizeBytes: buffer.length,
      buffer,
      altText,
      encryptionTier: chatKey ? "standard" : "public",
      chatKey,
      keyId: chatKey?.keyId ?? null,
      pipelineConfig,
    },
    uploadDir,
  },);

  const body = {
    id: asset.id,
    filename: asset.filename,
    mime_type: asset.mime_type,
    asset_type: asset.asset_type,
    size_bytes: asset.size_bytes,
    storage_backend: asset.storage_backend,
    alt_text: asset.alt_text,
    ...(duplicate && { duplicate: true, }),
  };

  if (duplicate) {
    return Response.json(body, {
      status: HttpStatus.OK,
      headers: {
        "Content-Type": "application/json",
        "HX-Trigger": jsonStringifyOr({ "asset:duplicate": { id: asset.id, filename: asset.filename, }, },),
      },
    },);
  }
  return Response.json(body, {
    status: HttpStatus.Created,
    headers: {
      "Content-Type": "application/json",
      "HX-Trigger": jsonStringifyOr({ "asset:uploaded": null, },),
    },
  },);
}
