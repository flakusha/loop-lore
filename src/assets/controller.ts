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
 *   DELETE /api/assets/:id          — delete asset
 *   POST   /api/assets/:id/links    — link to entity
 *   DELETE /api/assets/:id/links/:linkId — unlink from entity
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { existsSync, readFileSync, } from "node:fs";
import { IMMUTABLE_CACHE_MAX_AGE, } from "../config/constants";
import type { Config, } from "../config/schema";
import { AssetLinkEntity, AssetVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import {
  badRequestResponse,
  jsonCreated,
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
  notFoundResponse,
  notOwnerResponse,
  unauthorizedResponse,
} from "../routes/http-utils";
import {
  canAccessAsset,
  createAsset,
  deleteAsset,
  detectAssetType,
  getAsset,
  getAssetFilePath,
  getAssetLinks,
  getAssetShares,
  linkAsset,
  listAssets,
  shareAsset,
  unlinkAsset,
  unshareAsset,
  updateAssetVisibility,
  validateFileSize,
  validateMimeType,
} from "./service";
import type { AssetRecord, } from "./service";

interface UploadOpts {
  request: Request;
  userId: string;
  database: Kysely<DB>;
  uploadDir: string;
  maxFileSize: number;
}
interface ServeRawOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  actorId: string | null;
  actorRole: string | null;
}
interface ServeCompressedOpts {
  database: Kysely<DB>;
  assetId: string;
  uploadDir: string;
  variant: string;
  actorId: string | null;
  actorRole: string | null;
}

interface ResolvedAsset {
  asset: AssetRecord;
}

/** Extract userId from context or return Unauthorized error. */
function requireUserId(ctx: unknown,): string | Response {
  const userId = (ctx as any).userId as string | null;
  if (!userId) {
    return unauthorizedResponse();
  }
  return userId;
}

/** Serve a file from disk with proper headers. */
function serveFile(
  filePath: string,
  contentType: string,
  opts?: { cacheControl?: string; extraHeaders?: Record<string, string> },
): Response {
  if (!existsSync(filePath,)) {
    return notFoundResponse("File not found on disk",);
  }
  const data = readFileSync(filePath,);
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": opts?.cacheControl ?? `public, max-age=${IMMUTABLE_CACHE_MAX_AGE}, immutable`,
      ...opts?.extraHeaders,
    },
  },);
}

async function resolveAsset(
  database: Kysely<DB>,
  assetId: string,
  actorId: string | null,
  actorRole: string | null,
): Promise<ResolvedAsset | Response> {
  const allowed = await canAccessAsset(database, assetId, actorId, actorRole,);
  if (!allowed) {
    return notFoundResponse();
  }

  const asset = await getAsset(database, assetId,);
  if (!asset) {
    return notFoundResponse("Asset not found",);
  }

  return { asset, };
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

        const result = await listAssets(database, {
          page,
          pageSize,
          entityType: entityType as AssetLinkEntity,
          entityId,
          label,
        },);
        return jsonPaginated({ data: result.data, total: result.total, page, pageSize, },);
      },)
      .post("/api/assets", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        return handleUpload({
          request: ctx.request,
          userId,
          database,
          uploadDir: config.assets.uploadDir,
          maxFileSize: config.assets.maxFileSize,
        },);
      },)
      // ── Single asset routes ──────────────────────────
      .get("/api/assets/:id", async (ctx,) => {
        const asset = await getAsset(database, ctx.params.id,);
        if (!asset) {
          return notFoundResponse("Asset not found",);
        }
        return jsonResponse(asset,);
      },)
      .patch("/api/assets/:id", async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const body = (await ctx.request.json()) as { visibility?: string };
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
      // ── File serving routes ──────────────────────────
      .get("/api/assets/:id/raw", async (ctx,) => {
        return handleServeRaw({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
        },);
      },)
      .get("/api/assets/:id/download", async (ctx,) => {
        return handleDownload({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
        },);
      },)
      .get("/api/assets/:id/thumb", async (ctx,) => {
        return handleServeCompressed({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          variant: "thumb",
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
        },);
      },)
      .get("/api/assets/:id/compressed", async (ctx,) => {
        return handleServeCompressed({
          database,
          assetId: ctx.params.id,
          uploadDir: config.assets.uploadDir,
          variant: "compressed",
          actorId: (ctx as any).userId ?? null,
          actorRole: (ctx as any).userRole ?? null,
        },);
      },)
      // ── Links sub-routes ─────────────────────────────
      .get("/api/assets/:id/links", async (ctx,) => {
        const links = await getAssetLinks(database, ctx.params.id,);
        return jsonResponse(links,);
      },)
      .post("/api/assets/:id/links", async (ctx,) => {
        const body = await ctx.request.json();
        await linkAsset({
          database,
          assetId: ctx.params.id,
          link: body as { entityType: AssetLinkEntity; entityId: string; label?: string },
        },);
        return jsonCreated({ id: ctx.params.id, },);
      },)
      .delete("/api/assets/:id/links/:linkId", async (ctx,) => {
        const body = (await ctx.request.json()) as { entityType?: string; entityId?: string };
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
        const userId = (ctx as any).userId as string | null;
        if (!userId) {
          return unauthorizedResponse();
        }

        const body = (await ctx.request.json()) as { actor_id?: string };
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
        const body = (await ctx.request.json()) as { actor_id?: string };
        if (!body.actor_id) {
          return badRequestResponse("actor_id is required",);
        }

        await unshareAsset({ database, assetId: ctx.params.id, sharedWithId: body.actor_id, },);
        return jsonNoContent();
      },)
      .get("/api/assets/:id/shares", async (ctx,) => {
        const shares = await getAssetShares(database, ctx.params.id,);
        return jsonResponse(shares,);
      },)
  );
}

async function handleUpload({
  request,
  userId,
  database,
  uploadDir,
  maxFileSize,
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

  const buffer = Buffer.from(await file.arrayBuffer(),);
  const sizeError = validateFileSize(buffer.length, maxFileSize,);
  if (sizeError) { return badRequestResponse(sizeError,); }

  const mimeType = file.type || "application/octet-stream";
  const mimeError = validateMimeType(mimeType,);
  if (mimeError) { return badRequestResponse(mimeError,); }

  const altText = (formData.get("alt_text",) as string) ?? undefined;

  const asset = await createAsset({
    database,
    input: {
      ownerId: userId,
      filename: file.name,
      mimeType,
      assetType: detectAssetType(mimeType,),
      sizeBytes: buffer.length,
      buffer,
      altText,
    },
    uploadDir,
  },);

  return jsonCreated({
    id: asset.id,
    filename: asset.filename,
    mime_type: asset.mime_type,
    asset_type: asset.asset_type,
    size_bytes: asset.size_bytes,
    storage_backend: asset.storage_backend,
    alt_text: asset.alt_text,
  },);
}

async function handleServeRaw({
  database,
  assetId,
  uploadDir,
  actorId,
  actorRole,
}: ServeRawOpts,): Promise<Response> {
  const resolved = await resolveAsset(database, assetId, actorId, actorRole,);
  if (resolved instanceof Response) { return resolved; }
  return serveFile(getAssetFilePath(uploadDir, resolved.asset.storage_path,), resolved.asset.mime_type,);
}

async function handleServeCompressed({
  database,
  assetId,
  uploadDir,
  variant,
  actorId,
  actorRole,
}: ServeCompressedOpts,): Promise<Response> {
  const resolved = await resolveAsset(database, assetId, actorId, actorRole,);
  if (resolved instanceof Response) { return resolved; }

  const subDir = `${assetId.slice(0, 2,)}/${assetId.slice(2, 4,)}`;
  const compressedPath = `compressed/${subDir}/${assetId}_${variant}.webp`;
  const fullPath = getAssetFilePath(uploadDir, compressedPath,);

  // Fall back to raw if no compressed variant
  if (!existsSync(fullPath,)) {
    return serveFile(getAssetFilePath(uploadDir, resolved.asset.storage_path,), resolved.asset.mime_type,);
  }
  return serveFile(fullPath, "image/webp",);
}

async function handleDownload({
  database,
  assetId,
  uploadDir,
  actorId,
  actorRole,
}: ServeRawOpts,): Promise<Response> {
  const resolved = await resolveAsset(database, assetId, actorId, actorRole,);
  if (resolved instanceof Response) { return resolved; }
  const { asset, } = resolved;
  const safeName = asset.filename.replaceAll(/[^\w.-]+/g, "_",);
  return serveFile(getAssetFilePath(uploadDir, asset.storage_path,), asset.mime_type, {
    extraHeaders: { "Content-Disposition": `attachment; filename="${safeName}"`, },
  },);
}
